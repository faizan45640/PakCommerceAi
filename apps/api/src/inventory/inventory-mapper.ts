import type { Database } from "@pakcommerce/integrations/supabase";
import type { Inventory, StockMovement } from "@pakcommerce/shared";

/**
 * Translates inventory rows into the shared inventory contract.
 *
 * Same split as the product mapper: storage is flat and snake_case, the
 * contract is camelCase, and the translation lives here in pure functions so it
 * can be tested without a database.
 */

export type InventoryRow = Database["public"]["Views"]["inventory"]["Row"];
export type StockMovementRow = Database["public"]["Tables"]["stock_movements"]["Row"];

export function toInventory(row: InventoryRow): Inventory {
  // Postgres cannot promise a view column is non-null, so the generated type
  // marks every one nullable. The view only lists tracked variants with a
  // quantity, so these are always present - and if that ever stops being true,
  // failing here beats reporting an unknown quantity as zero stock.
  if (
    row.id === null ||
    row.variant_id === null ||
    row.product_id === null ||
    row.seller_id === null ||
    row.workspace_id === null ||
    row.quantity_on_hand === null ||
    row.reserved_quantity === null ||
    row.available_quantity === null ||
    row.state === null ||
    row.created_at === null ||
    row.updated_at === null
  ) {
    throw new Error("Malformed inventory row: a required column is null.");
  }

  return {
    id: row.id,
    variantId: row.variant_id,
    productId: row.product_id,
    sellerId: row.seller_id,
    workspaceId: row.workspace_id,
    trackInventory: row.track_inventory ?? true,
    quantityOnHand: row.quantity_on_hand,
    reservedQuantity: row.reserved_quantity,
    availableQuantity: row.available_quantity,
    lowStockThreshold: row.low_stock_threshold,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toStockMovement(row: StockMovementRow): StockMovement {
  return {
    id: row.id,
    variantId: row.variant_id,
    productId: row.product_id,
    sellerId: row.seller_id,
    workspaceId: row.workspace_id,
    reason: row.reason,
    quantityDelta: row.quantity_delta,
    beforeQuantityOnHand: row.before_quantity_on_hand,
    afterQuantityOnHand: row.after_quantity_on_hand,
    performedBy: row.performed_by,
    note: row.note,
    createdAt: row.created_at,
  };
}
