import { z } from "zod";

import { productListItemSchema } from "@pakcommerce/shared";

import { listProducts } from "../../../products/product-service.js";
import type { SellerContext } from "../../../middleware/seller-context.js";

/**
 * Read-Side AI Tool: search the seller's product catalogue.
 *
 * This is the structured counterpart to `queryDatabase`: instead of letting the
 * LLM write SQL, it fills in typed fields (status, inventory state, sort...) and
 * the existing product service does the querying through the normal, validated
 * path. RLS scoping comes from the seller context, exactly as in the REST API -
 * there is no seller filter in this file.
 *
 * The tool is built per-request (a factory closing over the seller context),
 * because the query must run as the seller who asked. A module-level tool could
 * not do that.
 */

const MAX_AI_RESULTS = 25;

const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
const INVENTORY_STATES = ["in_stock", "low_stock", "out_of_stock", "untracked"] as const;

type ProductStatus = (typeof PRODUCT_STATUSES)[number];
type InventoryState = (typeof INVENTORY_STATES)[number];

/** Seller speech the model often copies into tool args. Map before Zod enums. */
const STATUS_ALIASES: Record<string, ProductStatus> = {
  draft: "draft",
  active: "active",
  archived: "archived",
  live: "active",
  published: "active",
  listed: "active",
  hidden: "archived",
  "not listed": "draft",
  "not_listed": "draft",
  "not listed yet": "draft",
};

const INVENTORY_ALIASES: Record<string, InventoryState> = {
  in_stock: "in_stock",
  "in stock": "in_stock",
  available: "in_stock",
  low_stock: "low_stock",
  low: "low_stock",
  "low stock": "low_stock",
  out_of_stock: "out_of_stock",
  "out of stock": "out_of_stock",
  finished: "out_of_stock",
  "sold out": "out_of_stock",
  untracked: "untracked",
};

function asStringList(value: unknown): unknown[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return null;
}

function normalizeStatuses(value: unknown): unknown {
  const list = asStringList(value);
  if (!list) return value;
  return list.map((item) => {
    if (typeof item !== "string") return item;
    return STATUS_ALIASES[item.trim().toLowerCase()] ?? item;
  });
}

function normalizeInventoryStates(value: unknown): unknown {
  const list = asStringList(value);
  if (!list) return value;
  return list.map((item) => {
    if (typeof item !== "string") return item;
    return INVENTORY_ALIASES[item.trim().toLowerCase()] ?? item;
  });
}

/**
 * LLM-facing input: a trimmed version of `productSearchQuerySchema`.
 *
 * Deliberately smaller than the REST query contract: no `workspaceId` (the
 * server resolves the seller's workspace), no `cursor` (the model pages forward,
 * it asks questions), and `searchFields` is omitted until the list endpoint
 * implements it. `limit` is capped so the model cannot ask for 100 rows of
 * context it will never read.
 *
 * Status/inventory aliases exist because the system prompt speaks to sellers
 * ("Live", "low") and the model often copies those words into tool args. Without
 * coercion the AI SDK rejects the call, burns a retry, and flashes a red card.
 */
export const searchProductsInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .optional()
    .describe("Free-text search across product title, SKU, tags and description"),
  statuses: z.preprocess(
    normalizeStatuses,
    z
      .array(z.enum(PRODUCT_STATUSES))
      .max(3)
      .optional()
      .describe(
        'DB statuses only after aliasing: draft|active|archived. Seller words map as Live→active, Hidden→archived, "Not listed"→draft.',
      ),
  ),
  inventoryStates: z.preprocess(
    normalizeInventoryStates,
    z
      .array(z.enum(INVENTORY_STATES))
      .max(4)
      .optional()
      .describe(
        "Stock states: in_stock|low_stock|out_of_stock|untracked. Seller words like low / finished are accepted.",
      ),
  ),
  categoryIds: z.array(z.uuid()).max(10).optional().describe("Only products in these categories"),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional().describe("Only products carrying any of these tags"),
  sort: z
    .enum(["newest", "updated_desc", "title_asc", "title_desc", "price_asc", "price_desc", "stock_asc", "stock_desc"])
    .default("updated_desc")
    .describe("Order of results. price/stock sorts use the rolled-up variant facts."),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_AI_RESULTS)
    .default(10)
    .describe(`How many products to return (1-${MAX_AI_RESULTS}).`),
});

export type SearchProductsInput = z.input<typeof searchProductsInputSchema>;

export type SearchProductsResult =
  | { status: "error"; message: string }
  | {
      status: "success";
      count: number;
      total: number;
      products: z.infer<typeof productListItemSchema>[];
    };

/**
 * The workspace a seller's products live in.
 *
 * A seller can own several workspaces, so the model must not invent the id.
 * The seller's default workspace is resolved from the context instead - the
 * same `is_default` flag the signup trigger creates and the API tests use.
 * Falls back to the first workspace if none is marked default, then reports
 * the problem as a structured result rather than throwing.
 */
async function resolveWorkspaceId(auth: SellerContext): Promise<string | null> {
  const { data, error } = await auth.db
    .from("workspaces")
    .select("id")
    .eq("seller_id", auth.sellerId)
    .eq("is_default", true)
    .maybeSingle();

  if (!error && data) return data.id;

  if (!error) {
    const { data: anyWorkspace } = await auth.db
      .from("workspaces")
      .select("id")
      .eq("seller_id", auth.sellerId)
      .maybeSingle();

    return anyWorkspace?.id ?? null;
  }

  return null;
}

export function searchProductsTool(auth: SellerContext) {
  return {
    description:
      "Search the seller's product catalogue (title, SKU, tags, status, stock state, price range) and return matching products as structured data. Use this for any question about what products exist, what is in stock, prices, or catalogue composition.",
    inputSchema: searchProductsInputSchema,
    execute: async (input: SearchProductsInput): Promise<SearchProductsResult> => {
      const workspaceId = await resolveWorkspaceId(auth);

      if (!workspaceId) {
        return {
          status: "error",
          message: "No workspace found for this seller. Create a workspace first.",
        };
      }

      try {
        const parsedInput = searchProductsInputSchema.parse(input);
        const { items, meta } = await listProducts(auth, {
          workspaceId,
          query: parsedInput.query,
          statuses: parsedInput.statuses,
          inventoryStates: parsedInput.inventoryStates,
          categoryIds: parsedInput.categoryIds,
          tags: parsedInput.tags,
          sort: parsedInput.sort ?? "updated_desc",
          limit: parsedInput.limit ?? 10,
        });

        // Structured output: validate what we return against the shared contract,
        // so the model summarises real catalogue data, never a malformed row.
        const parsed = z.array(productListItemSchema).safeParse(items);

        return {
          status: "success",
          count: items.length,
          total: meta.total,
          products: parsed.success ? parsed.data : [],
        };
      } catch (error) {
        return {
          status: "error",
          message: error instanceof Error ? error.message : "Could not search products.",
        };
      }
    },
  };
}
