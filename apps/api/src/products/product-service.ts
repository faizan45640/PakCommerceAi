import type { Database } from "@pakcommerce/integrations/supabase";
import type {
  ApiMeta,
  ParsedCreateProductInput,
  ParsedProductSearchQuery,
  Product,
  ProductListItem,
  UpdateProductInput,
} from "@pakcommerce/shared";

import { ConflictError, NotFoundError, ValidationError } from "../lib/http-errors.js";
import type { SellerContext } from "./seller-context.js";
import { buildSearchText } from "./product-search-text.js";
import type { ProductListRow } from "./product-mapper.js";
import { toProduct, toProductListItem } from "./product-mapper.js";
import { slugifyTitle } from "./product-slug.js";

/**
 * Product reads and writes.
 *
 * Every query here goes through `auth.db`, the request-scoped client carrying the
 * seller's token. That means **no handler filters by seller** - the RLS policies
 * do it inside Postgres. If you ever find yourself adding `.eq("seller_id", ...)`
 * in this file, something has gone wrong upstream: it would mean isolation had
 * quietly become a thing a developer must remember.
 */

/** Sorts that map onto a column of `product_list_view`. */
const SORT_COLUMNS = {
  newest: { column: "created_at", ascending: false },
  updated_desc: { column: "updated_at", ascending: false },
  title_asc: { column: "title", ascending: true },
  title_desc: { column: "title", ascending: false },
  price_asc: { column: "min_price_amount_minor", ascending: true },
  price_desc: { column: "max_price_amount_minor", ascending: false },
  stock_asc: { column: "total_quantity_on_hand", ascending: true },
  stock_desc: { column: "total_quantity_on_hand", ascending: false },
} as const;

/**
 * Two shared contracts disagree about pagination, so this satisfies both.
 *
 * `productSearchQuerySchema` (domain) is cursor-based: `cursor` and `limit`.
 * `apiListResponseSchema` (transport) requires `meta: { page, pageSize, total }`.
 *
 * The cursor therefore carries a page number: callers can keep passing the
 * opaque `nextCursor` they were given, and the response still reports the
 * page/pageSize/total the envelope demands. It stays opaque so it can become
 * keyset pagination later without a contract change.
 *
 * Raised with the team rather than silently picked - see docs/api.md.
 */
function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 1;

  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const page = Number(decoded?.page);

    if (!Number.isInteger(page) || page < 1) throw new Error("bad page");
    return page;
  } catch {
    throw new ValidationError("Invalid cursor.", { cursor: ["Cursor is not valid."] });
  }
}

function encodeCursor(page: number): string {
  return Buffer.from(JSON.stringify({ page }), "utf8").toString("base64url");
}

export async function createProduct(
  auth: SellerContext,
  input: ParsedCreateProductInput,
): Promise<Product> {
  if (input.images.length > 0) {
    // Better to refuse than to accept images and silently drop them. The table
    // arrives with the product-images task. Reported as a validation error
    // because that is the vocabulary apiErrorCodeSchema gives us - there is no
    // "not implemented" code, and inventing one would break the shared contract.
    throw new ValidationError("Product images are not supported yet.", {
      images: ["Product images are not supported yet. Send an empty array."],
    });
  }

  const slug = input.slug ?? slugifyTitle(input.title);

  const payload = {
    workspace_id: input.workspaceId,
    // From the verified token, never from the request body. The contract's
    // README is explicit: a client sends workspaceId, the backend derives
    // sellerId from authenticated seller context.
    seller_id: auth.sellerId,
    title: input.title,
    slug,
    description: input.description ?? null,
    status: input.status,
    tags: input.tags,
    category_ids: input.categoryIds,
    options: input.options,
    search_text: buildSearchText({
      title: input.title,
      slug,
      description: input.description,
      tags: input.tags,
      options: input.options,
      variants: input.variants,
    }),
    variants: input.variants.map((variant, index) => ({
      title: variant.title,
      sku: variant.sku ?? null,
      barcode: variant.barcode ?? null,
      status: variant.status ?? "active",
      price_amount_minor: variant.price.amountMinor,
      price_currency: variant.price.currency ?? "PKR",
      compare_at_price_amount_minor: variant.compareAtPrice?.amountMinor ?? null,
      compare_at_price_currency: variant.compareAtPrice?.currency ?? null,
      option_values: variant.optionValues ?? [],
      track_inventory: variant.inventory?.trackInventory ?? true,
      quantity_on_hand: variant.inventory?.quantityOnHand ?? null,
      low_stock_threshold: variant.inventory?.lowStockThreshold ?? null,
      position: variant.position ?? index,
    })),
  };

  // One statement, so a failing variant rolls the product back with it.
  const { data, error } = await auth.db.rpc("create_product", { payload });

  if (error) throw translatePostgresError(error);

  return getProduct(auth, data);
}

export async function getProduct(auth: SellerContext, id: string): Promise<Product> {
  const { data, error } = await auth.db
    .from("products")
    .select("*, product_variants(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw translatePostgresError(error);
  // Absent and belongs-to-another-seller are indistinguishable here, which is
  // the intended behaviour - RLS filtered it out before we saw it.
  if (!data) throw new NotFoundError("Product not found.");

  const { product_variants: variants, ...row } = data as typeof data & {
    product_variants: Parameters<typeof toProduct>[1];
  };

  return toProduct(row, variants ?? []);
}

export async function listProducts(
  auth: SellerContext,
  query: ParsedProductSearchQuery,
): Promise<{ items: ProductListItem[]; meta: ApiMeta; nextCursor: string | null }> {
  const page = decodeCursor(query.cursor);
  const offset = (page - 1) * query.limit;
  const sort = SORT_COLUMNS[query.sort];

  let builder = auth.db
    .from("product_list_view")
    // `exact` because the envelope requires a real total, not an estimate.
    .select("*", { count: "exact" })
    .eq("workspace_id", query.workspaceId);

  if (query.statuses?.length) builder = builder.in("status", query.statuses);
  if (query.categoryIds?.length) builder = builder.overlaps("category_ids", query.categoryIds);
  if (query.tags?.length) builder = builder.overlaps("tags", query.tags);
  if (query.inventoryStates?.length) {
    builder = builder.overlaps("variant_states", query.inventoryStates);
  }
  if (query.query) {
    // search_text is lowercased when generated, so a case-insensitive contains
    // is enough until a real full-text index exists.
    builder = builder.ilike("search_text", `%${query.query.toLowerCase()}%`);
  }

  const { data, count, error } = await builder
    .order(sort.column, { ascending: sort.ascending })
    // Ties broken by id, or the same row could appear on two pages.
    .order("id", { ascending: true })
    .range(offset, offset + query.limit - 1);

  if (error) throw translatePostgresError(error);

  const total = count ?? 0;
  const rows = (data ?? []) as unknown as ProductListRow[];

  return {
    items: rows.map(toProductListItem),
    meta: { page, pageSize: query.limit, total },
    nextCursor: offset + rows.length < total ? encodeCursor(page + 1) : null,
  };
}

export async function updateProduct(
  auth: SellerContext,
  id: string,
  input: UpdateProductInput,
): Promise<Product> {
  // Read first, so search_text can be rebuilt from the merged product rather
  // than from the patch alone - a title change has to re-index the whole
  // document, not just its own words.
  const current = await getProduct(auth, id);

  const merged = {
    title: input.title ?? current.title,
    slug: input.slug ?? current.slug,
    description: input.description === undefined ? current.description : input.description,
    tags: input.tags ?? current.tags,
    options: input.options ?? current.options,
  };

  const patch: Database["public"]["Tables"]["products"]["Update"] = {
    title: merged.title,
    slug: merged.slug,
    description: merged.description ?? null,
    tags: merged.tags,
    options: merged.options as Database["public"]["Tables"]["products"]["Update"]["options"],
    search_text: buildSearchText({
      ...merged,
      description: merged.description,
      variants: current.variants,
    }),
  };

  if (input.status !== undefined) patch.status = input.status;
  if (input.categoryIds !== undefined) patch.category_ids = input.categoryIds;

  const { data, error } = await auth.db
    .from("products")
    .update(patch)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) throw translatePostgresError(error);
  if (!data) throw new NotFoundError("Product not found.");

  return getProduct(auth, id);
}

/**
 * Archives rather than deletes.
 *
 * A hard delete cascades to every variant and loses the history that orders and
 * inventory movements will point at. The contract models retirement as
 * `status = 'archived'`, which is reversible and leaves a trail - the same
 * reasoning that left workspaces without a delete policy.
 */
export async function archiveProduct(
  auth: SellerContext,
  id: string,
): Promise<Product> {
  const { data, error } = await auth.db
    .from("products")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) throw translatePostgresError(error);
  if (!data) throw new NotFoundError("Product not found.");

  return getProduct(auth, id);
}

/**
 * Turns a Postgres failure into something a caller can act on.
 *
 * Constraint names are the project's own vocabulary, so a violation can be
 * reported as a specific 400 instead of a generic 500. Anything unrecognised is
 * re-thrown untouched and becomes a 500 - guessing at an unknown database error
 * would hide real bugs.
 */
function translatePostgresError(error: { code?: string; message: string; details?: string }) {
  switch (error.code) {
    case "23505": // unique_violation
      // A real 409: the request is well-formed and collides with stored data.
      return new ConflictError("That slug or SKU is already used in this workspace.", {
        slug: ["Already used in this workspace."],
      });
    case "23514": // check_violation
      return new ValidationError("Rejected by a database constraint.", {
        _: [error.message],
      });
    case "23503": // foreign_key_violation
      return new ValidationError("Unknown workspace.", {
        workspaceId: ["The workspace does not exist, or does not belong to you."],
      });
    case "42501": // insufficient_privilege - RLS refused the write
      return new NotFoundError("Product not found.");
    default:
      return Object.assign(new Error(error.message), { cause: error });
  }
}
