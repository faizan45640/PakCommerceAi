import { z } from "zod";

import type { SearchProductsResult } from "../copilot/tools/read/search-products.js";
import { ToolError, type ToolContext } from "./registry.js";

/**
 * Buyer-facing shapes for the WhatsApp sales agent.
 *
 * Compact on purpose: an LLM replying on WhatsApp needs names, variant labels,
 * PKR prices and "is it in stock", not ids of categories or timestamps. Nothing
 * here carries buyer data. Every query is scoped to `ctx.workspaceId`, which the
 * agent router took from the conversation, so the agent can only ever see the
 * shop the conversation belongs to. Only live (active) products and variants.
 */

type QtyBucket = "none" | "1-3" | "4-10" | "10+" | "untracked";

interface VariantRow {
  id: string;
  product_id: string;
  title: string;
  option_values: unknown;
  price_amount_minor: number;
  price_currency: string;
  quantity_on_hand: number | null;
  track_inventory: boolean;
  inventory_state: string | null;
}

export interface AgentVariant {
  variantId: string;
  label: string;
  pricePkr: number;
  inStock: boolean;
  quantity: QtyBucket;
}

function optionPairs(value: unknown): { name: string; value: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = item as { optionName?: unknown; value?: unknown };
    return typeof record?.optionName === "string" && typeof record.value === "string"
      ? [{ name: record.optionName, value: record.value }]
      : [];
  });
}

function bucket(row: VariantRow): QtyBucket {
  if (row.inventory_state === "untracked" || row.quantity_on_hand === null) return "untracked";
  const qty = row.quantity_on_hand;
  if (qty <= 0) return "none";
  if (qty <= 3) return "1-3";
  if (qty <= 10) return "4-10";
  return "10+";
}

function toAgentVariant(row: VariantRow): AgentVariant {
  const pairs = optionPairs(row.option_values);
  const quantity = bucket(row);
  return {
    variantId: row.id,
    label: pairs.length ? pairs.map((p) => `${p.name}: ${p.value}`).join(", ") : row.title,
    pricePkr: row.price_amount_minor / 100,
    inStock: quantity !== "none",
    quantity,
  };
}

const VARIANT_COLUMNS =
  "id, product_id, title, option_values, price_amount_minor, price_currency, quantity_on_hand, track_inventory, inventory_state";

async function loadVariants(ctx: ToolContext, productIds: string[]): Promise<VariantRow[]> {
  if (productIds.length === 0) return [];
  const { data, error } = await ctx.db
    .from("product_variants")
    .select(VARIANT_COLUMNS)
    .eq("workspace_id", ctx.workspaceId as string)
    .eq("status", "active")
    .in("product_id", productIds)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as VariantRow[];
}

/** Turns the full catalogue search result into the compact agent shape. */
export async function compactSearch(ctx: ToolContext, result: SearchProductsResult) {
  if (result.status === "error") {
    throw new ToolError("search_failed", "Could not search products.");
  }

  const variants = await loadVariants(
    ctx,
    result.products.map((product) => product.id),
  );

  return {
    total: result.total,
    products: result.products.map((product) => {
      const own = variants.filter((row) => row.product_id === product.id).map(toAgentVariant);
      return {
        productId: product.id,
        name: product.title,
        priceFromPkr: product.priceRange.min.amountMinor / 100,
        priceToPkr: product.priceRange.max.amountMinor / 100,
        inStock: own.some((variant) => variant.inStock),
        variants: own,
      };
    }),
  };
}

export const checkInventoryInputSchema = z.object({
  productId: z.uuid().describe("Product id returned by searchProducts"),
  size: z.string().trim().min(1).max(40).optional().describe('Size to check, e.g. "M" or "42"'),
  colour: z.string().trim().min(1).max(40).optional().describe('Colour to check, e.g. "Black"'),
});

export type CheckInventoryInput = z.infer<typeof checkInventoryInputSchema>;

const SIZE_NAMES = new Set(["size"]);
const COLOUR_NAMES = new Set(["colour", "color"]);

function matches(row: VariantRow, names: Set<string>, wanted: string | undefined): boolean {
  if (!wanted) return true;
  const target = wanted.trim().toLowerCase();
  return optionPairs(row.option_values).some(
    (pair) => names.has(pair.name.trim().toLowerCase()) && pair.value.trim().toLowerCase() === target,
  );
}

function distinct(rows: VariantRow[], names: Set<string>): string[] {
  return [
    ...new Set(
      rows.flatMap((row) =>
        optionPairs(row.option_values)
          .filter((pair) => names.has(pair.name.trim().toLowerCase()))
          .map((pair) => pair.value),
      ),
    ),
  ];
}

export async function checkInventory(ctx: ToolContext, input: CheckInventoryInput) {
  if (!ctx.workspaceId) throw new Error("Sales agent calls need a workspace.");

  const { data: product, error } = await ctx.db
    .from("products")
    .select("id, title")
    .eq("id", input.productId)
    .eq("workspace_id", ctx.workspaceId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!product) throw new ToolError("product_not_found", "No live product with that id.", 404);

  const all = await loadVariants(ctx, [product.id]);
  const matched = all.filter(
    (row) => matches(row, SIZE_NAMES, input.size) && matches(row, COLOUR_NAMES, input.colour),
  );

  return {
    productId: product.id,
    name: product.title,
    availableSizes: distinct(all, SIZE_NAMES),
    availableColours: distinct(all, COLOUR_NAMES),
    anyInStock: matched.some((row) => bucket(row) !== "none"),
    variants: matched.map(toAgentVariant),
  };
}
