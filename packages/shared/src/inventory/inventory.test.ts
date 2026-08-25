import { describe, expect, it } from "vitest";

import {
  adjustStockInputSchema,
  inventoryContractVersion,
  inventorySchema,
  inventorySearchQuerySchema,
  stockMovementReasonValues,
  stockMovementSchema,
} from "./index.js";

const NOW = "2026-08-23T10:00:00.000Z";
const INVENTORY_ID = "11111111-1111-4111-8111-111111111111";
const VARIANT_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";
const SELLER_ID = "44444444-4444-4444-8444-444444444444";
const WORKSPACE_ID = "55555555-5555-4555-8555-555555555555";
const USER_ID = "66666666-6666-4666-8666-666666666666";

function inventory(overrides: Record<string, unknown> = {}) {
  return {
    id: INVENTORY_ID,
    variantId: VARIANT_ID,
    productId: PRODUCT_ID,
    sellerId: SELLER_ID,
    workspaceId: WORKSPACE_ID,
    trackInventory: true,
    quantityOnHand: 50,
    reservedQuantity: 10,
    lowStockThreshold: 15,
    state: "in_stock",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function movement(overrides: Record<string, unknown> = {}) {
  return {
    id: INVENTORY_ID,
    variantId: VARIANT_ID,
    productId: PRODUCT_ID,
    sellerId: SELLER_ID,
    workspaceId: WORKSPACE_ID,
    reason: "purchase",
    quantityDelta: 20,
    beforeQuantityOnHand: 30,
    afterQuantityOnHand: 50,
    performedBy: USER_ID,
    note: null,
    createdAt: NOW,
    ...overrides,
  };
}

describe("inventory contract", () => {
  it("contract version is pinned", () => {
    expect(inventoryContractVersion).toBe("2026-08-23");
  });
});

describe("stockMovementReasonValues", () => {
  it("movement reasons are a closed list of six", () => {
    expect([...stockMovementReasonValues]).toEqual([
      "purchase",
      "sale",
      "return",
      "manual_adjustment",
      "correction",
      "damage_loss",
    ]);
  });
});

describe("inventorySchema", () => {
  it("accepts a well-formed inventory record", () => {
    expect(inventorySchema.safeParse(inventory()).success).toBe(true);
  });

  it("rejects negative quantity on hand", () => {
    expect(
      inventorySchema.safeParse(inventory({ quantityOnHand: -1 })).success,
    ).toBe(false);
  });

  it("rejects negative reserved quantity", () => {
    expect(
      inventorySchema.safeParse(inventory({ reservedQuantity: -1 })).success,
    ).toBe(false);
  });

  it("rejects reserved quantity above quantity on hand", () => {
    const result = inventorySchema.safeParse(
      inventory({ reservedQuantity: 51 }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path.includes("reservedQuantity"))).toBe(true);
  });

  it("rejects negative low-stock threshold", () => {
    expect(
      inventorySchema.safeParse(inventory({ lowStockThreshold: -5 })).success,
    ).toBe(false);
  });

  it("allows null low-stock threshold for thresholdless variants", () => {
    expect(
      inventorySchema.safeParse(inventory({ lowStockThreshold: null })).success,
    ).toBe(true);
  });

  it("requires tenant scoping fields", () => {
    expect(
      inventorySchema.safeParse(inventory({ workspaceId: undefined })).success,
    ).toBe(false);
    expect(
      inventorySchema.safeParse(inventory({ sellerId: undefined })).success,
    ).toBe(false);
  });
});

describe("stockMovementSchema", () => {
  it("accepts a consistent purchase movement", () => {
    expect(stockMovementSchema.safeParse(movement()).success).toBe(true);
  });

  it("rejects after quantity that does not equal before plus delta", () => {
    const result = stockMovementSchema.safeParse(
      movement({ afterQuantityOnHand: 49 }),
    );

    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some((i) => i.path.includes("afterQuantityOnHand")),
    ).toBe(true);
  });

  it("rejects zero-delta movements", () => {
    const result = stockMovementSchema.safeParse(
      movement({
        quantityDelta: 0,
        beforeQuantityOnHand: 50,
        afterQuantityOnHand: 50,
      }),
    );

    expect(result.success).toBe(false);
  });

  it("rejects negative resulting stock", () => {
    expect(
      stockMovementSchema.safeParse(
        movement({
          quantityDelta: -40,
          beforeQuantityOnHand: 30,
          afterQuantityOnHand: -10,
        }),
      ).success,
    ).toBe(false);
  });

  it("rejects unknown movement reasons", () => {
    expect(stockMovementSchema.safeParse(movement({ reason: "misc" })).success).toBe(
      false,
    );
  });

  it("trims and bounds the note", () => {
    expect(
      stockMovementSchema.safeParse(movement({ note: "  received carton  " }))
        .success,
    ).toBe(true);
    expect(
      stockMovementSchema.safeParse(movement({ note: "x".repeat(501) })).success,
    ).toBe(false);
  });
});

describe("adjustStockInputSchema", () => {
  const input = {
    workspaceId: WORKSPACE_ID,
    variantId: VARIANT_ID,
    targetQuantityOnHand: 60,
    reason: "manual_adjustment",
  };

  it("accepts a minimal adjustment without a note", () => {
    const result = adjustStockInputSchema.parse(input);

    expect(result.targetQuantityOnHand).toBe(60);
    expect(result.note).toBeUndefined();
  });

  it("rejects negative targets so bad adjustments never reach the service", () => {
    expect(
      adjustStockInputSchema.safeParse({ ...input, targetQuantityOnHand: -3 })
        .success,
    ).toBe(false);
  });

  it("requires a reason from the closed list", () => {
    expect(
      adjustStockInputSchema.safeParse({ ...input, reason: "because" }).success,
    ).toBe(false);
    expect(
      adjustStockInputSchema.safeParse({ ...input, reason: undefined }).success,
    ).toBe(false);
  });

  it("rejects fractional quantities", () => {
    expect(
      adjustStockInputSchema.safeParse({ ...input, targetQuantityOnHand: 2.5 })
        .success,
    ).toBe(false);
  });
});

describe("inventorySearchQuerySchema", () => {
  it("search query defaults sort, limit, and lowStockOnly", () => {
    const result = inventorySearchQuerySchema.parse({
      workspaceId: WORKSPACE_ID,
    });

    expect(result.sort).toBe("updated_desc");
    expect(result.limit).toBe(25);
    expect(result.lowStockOnly).toBe(false);
  });

  it("search query rejects limit above 100", () => {
    expect(
      inventorySearchQuerySchema.safeParse({
        workspaceId: WORKSPACE_ID,
        limit: 101,
      }).success,
    ).toBe(false);
  });

  it("search query requires workspace id", () => {
    // Tenant isolation starts here: a query with no workspace is not constructible.
    expect(inventorySearchQuerySchema.safeParse({}).success).toBe(false);
  });
});
