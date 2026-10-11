import { inventorySchema, stockMovementSchema } from "@pakcommerce/shared";
import { describe, expect, it } from "vitest";

import type { InventoryRow, StockMovementRow } from "./inventory-mapper.js";
import { toInventory, toStockMovement } from "./inventory-mapper.js";

const NOW = "2026-10-11T10:00:00.000+00:00";
const VARIANT_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";
const SELLER_ID = "33333333-3333-4333-8333-333333333333";
const WORKSPACE_ID = "44444444-4444-4444-8444-444444444444";
const MOVEMENT_ID = "55555555-5555-4555-8555-555555555555";

function inventoryRow(overrides: Partial<InventoryRow> = {}): InventoryRow {
  return {
    id: VARIANT_ID,
    variant_id: VARIANT_ID,
    product_id: PRODUCT_ID,
    seller_id: SELLER_ID,
    workspace_id: WORKSPACE_ID,
    track_inventory: true,
    quantity_on_hand: 12,
    reserved_quantity: 4,
    available_quantity: 8,
    low_stock_threshold: 3,
    state: "in_stock",
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function movementRow(overrides: Partial<StockMovementRow> = {}): StockMovementRow {
  return {
    id: MOVEMENT_ID,
    variant_id: VARIANT_ID,
    product_id: PRODUCT_ID,
    seller_id: SELLER_ID,
    workspace_id: WORKSPACE_ID,
    reason: "purchase",
    quantity_delta: 5,
    before_quantity_on_hand: 7,
    after_quantity_on_hand: 12,
    performed_by: SELLER_ID,
    note: "Eid restock",
    created_at: NOW,
    ...overrides,
  };
}

describe("toInventory", () => {
  it("maps a view row onto the inventory contract", () => {
    expect(toInventory(inventoryRow())).toEqual({
      id: VARIANT_ID,
      variantId: VARIANT_ID,
      productId: PRODUCT_ID,
      sellerId: SELLER_ID,
      workspaceId: WORKSPACE_ID,
      trackInventory: true,
      quantityOnHand: 12,
      reservedQuantity: 4,
      lowStockThreshold: 3,
      state: "in_stock",
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it("produces something the shared contract accepts", () => {
    expect(inventorySchema.safeParse(toInventory(inventoryRow())).success).toBe(true);
  });

  it("keeps an absent low-stock threshold as null", () => {
    expect(toInventory(inventoryRow({ low_stock_threshold: null })).lowStockThreshold).toBeNull();
  });

  it("refuses a row with no quantity instead of inventing zero", () => {
    // The view only lists tracked variants, so this cannot happen through it.
    // If it ever does, reporting 0 would turn "unknown" into "out of stock".
    expect(() => toInventory(inventoryRow({ quantity_on_hand: null }))).toThrow(
      /inventory row/i,
    );
  });
});

describe("toStockMovement", () => {
  it("maps a row onto the stock movement contract", () => {
    expect(toStockMovement(movementRow())).toEqual({
      id: MOVEMENT_ID,
      variantId: VARIANT_ID,
      productId: PRODUCT_ID,
      sellerId: SELLER_ID,
      workspaceId: WORKSPACE_ID,
      reason: "purchase",
      quantityDelta: 5,
      beforeQuantityOnHand: 7,
      afterQuantityOnHand: 12,
      performedBy: SELLER_ID,
      note: "Eid restock",
      createdAt: NOW,
    });
  });

  it("produces something the shared contract accepts", () => {
    expect(stockMovementSchema.safeParse(toStockMovement(movementRow())).success).toBe(true);
  });

  it("keeps a negative delta negative", () => {
    const movement = toStockMovement(
      movementRow({
        reason: "sale",
        quantity_delta: -2,
        before_quantity_on_hand: 12,
        after_quantity_on_hand: 10,
      }),
    );

    expect(movement.quantityDelta).toBe(-2);
  });
});
