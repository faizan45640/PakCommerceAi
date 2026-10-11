import type {
  ApiMeta,
  ParsedAdjustStockInput,
  ParsedStockMovementSearchQuery,
  StockAdjustmentResult,
  StockMovement,
} from "@pakcommerce/shared";

import { NotFoundError, ValidationError } from "../lib/http-errors.js";
import { decodePageCursor, encodePageCursor } from "../lib/page-cursor.js";
import type { SellerContext } from "../middleware/seller-context.js";
import { toInventory, toStockMovement } from "./inventory-mapper.js";

/**
 * Stock adjustments and their history.
 *
 * As in the product service, every query goes through `auth.db`, the
 * request-scoped client carrying the seller's token, so RLS does the seller
 * scoping inside Postgres and nothing here filters by seller.
 *
 * This service decides nothing about stock. The quantity change, the movement
 * record and every guard live in the `adjust_stock` database function, because
 * they have to happen in one transaction against a locked row and supabase-js
 * cannot give us that. What is left here is translation: contract in, contract
 * out, and database refusals turned into errors a caller can act on.
 */

export async function adjustStock(
  auth: SellerContext,
  input: ParsedAdjustStockInput,
): Promise<StockAdjustmentResult> {
  const { data: movementId, error } = await auth.db.rpc("adjust_stock", {
    p_workspace_id: input.workspaceId,
    p_variant_id: input.variantId,
    p_target_quantity: input.targetQuantityOnHand,
    p_reason: input.reason,
    p_note: input.note ?? undefined,
  });

  if (error) throw translateAdjustmentError(error);

  const [movement, inventory] = await Promise.all([
    auth.db.from("stock_movements").select("*").eq("id", movementId).single(),
    auth.db.from("inventory").select("*").eq("variant_id", input.variantId).single(),
  ]);

  // The adjustment has already committed. A failure to read it back is a bug or
  // an outage, not something the caller did, so it surfaces as a 500.
  if (movement.error) throw new Error(movement.error.message, { cause: movement.error });
  if (inventory.error) throw new Error(inventory.error.message, { cause: inventory.error });

  return {
    inventory: toInventory(inventory.data),
    movement: toStockMovement(movement.data),
  };
}

export async function listStockMovements(
  auth: SellerContext,
  query: ParsedStockMovementSearchQuery,
): Promise<{ items: StockMovement[]; meta: ApiMeta; nextCursor: string | null }> {
  const page = decodePageCursor(query.cursor);
  const offset = (page - 1) * query.limit;

  let builder = auth.db
    .from("stock_movements")
    // `exact` because the envelope requires a real total, not an estimate.
    .select("*", { count: "exact" })
    .eq("workspace_id", query.workspaceId);

  if (query.variantId) builder = builder.eq("variant_id", query.variantId);
  if (query.reasons?.length) builder = builder.in("reason", query.reasons);

  const { data, count, error } = await builder
    .order("created_at", { ascending: false })
    // Ties broken by id, or the same row could appear on two pages.
    .order("id", { ascending: true })
    .range(offset, offset + query.limit - 1);

  if (error) throw new Error(error.message, { cause: error });

  const total = count ?? 0;
  const rows = data ?? [];

  return {
    items: rows.map(toStockMovement),
    meta: { page, pageSize: query.limit, total },
    nextCursor: offset + rows.length < total ? encodePageCursor(page + 1) : null,
  };
}

/**
 * Turns an `adjust_stock` refusal into something a caller can act on.
 *
 * The function raises a stable token as its message (see the migration), so
 * this matches on vocabulary the project owns rather than on Postgres prose.
 * Anything unrecognised is re-thrown untouched and becomes a 500 - guessing at
 * an unknown database error would hide real bugs.
 */
function translateAdjustmentError(error: { code?: string; message: string; details?: string }) {
  switch (error.message) {
    case "variant_not_found":
      // Absent and belongs-to-another-seller are reported identically, for the
      // same reason as products: a 403 would confirm the id exists.
      return new NotFoundError("Variant not found.");
    case "stock_not_tracked":
      return new ValidationError("This variant does not track stock.", {
        variantId: ["Stock is not tracked for this variant, so it cannot be adjusted."],
      });
    case "stock_negative":
      return new ValidationError("Stock cannot go below zero.", {
        targetQuantityOnHand: ["Stock cannot be set below zero."],
      });
    case "stock_below_reserved":
      return new ValidationError("Stock cannot go below what is already reserved.", {
        targetQuantityOnHand: [
          `${error.details} units are reserved for orders. Stock cannot be set below that.`,
        ],
      });
    case "stock_unchanged":
      return new ValidationError("Stock is already at that quantity.", {
        targetQuantityOnHand: [`Stock is already ${error.details}. Nothing to change.`],
      });
    default:
      return Object.assign(new Error(error.message), { cause: error });
  }
}
