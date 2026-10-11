/**
 * Tier 2 — the stock adjustment API end to end.
 *
 * Real Express app, real JWTs, real Postgres with RLS on. As with the product
 * API, nothing is stubbed: the point is that a seller's token reaches the
 * database and the database does the scoping.
 *
 * Requires the local Supabase stack: `npx supabase start`.
 */

import { stockAdjustmentResultSchema, stockMovementSchema } from "@pakcommerce/shared";
import request from "supertest";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import type { TestSeller } from "../testing/api-test-env.js";
import {
  applyTestEnv,
  createTestSeller,
  createTestVariant,
  deleteTestSeller,
} from "../testing/api-test-env.js";

const app = () => createApp();
const ADJUSTMENTS = "/api/v1/inventory/adjustments";
const MOVEMENTS = "/api/v1/inventory/movements";

let alice: TestSeller;
let bob: TestSeller;

beforeAll(() => {
  applyTestEnv();
});

beforeEach(async () => {
  alice = await createTestSeller("alice");
  bob = await createTestSeller("bob");
});

afterEach(async () => {
  await deleteTestSeller(alice);
  await deleteTestSeller(bob);
});

function as(seller: TestSeller, method: "post" | "get", path: string) {
  return request(app())[method](path).set("Authorization", `Bearer ${seller.accessToken}`);
}

function adjustment(seller: TestSeller, variantId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: seller.workspaceId,
    variantId,
    targetQuantityOnHand: 25,
    reason: "purchase",
    ...overrides,
  };
}

describe("authentication", () => {
  it("rejects an adjustment with no token", async () => {
    const { variantId } = await createTestVariant(alice);

    const response = await request(app()).post(ADJUSTMENTS).send(adjustment(alice, variantId));

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("unauthorized");
  });

  it("rejects a history request with no token", async () => {
    const response = await request(app()).get(MOVEMENTS).query({ workspaceId: alice.workspaceId });

    expect(response.status).toBe(401);
  });
});

describe("POST /api/v1/inventory/adjustments", () => {
  it("sets the new quantity and returns the movement that recorded it", async () => {
    const { variantId, productId } = await createTestVariant(alice, { quantity: 10 });

    const response = await as(alice, "post", ADJUSTMENTS).send(
      adjustment(alice, variantId, { note: "Eid restock" }),
    );

    expect(response.status).toBe(201);
    expect(response.body.data.inventory).toMatchObject({
      variantId,
      productId,
      quantityOnHand: 25,
      reservedQuantity: 0,
      state: "in_stock",
    });
    expect(response.body.data.movement).toMatchObject({
      variantId,
      productId,
      workspaceId: alice.workspaceId,
      sellerId: alice.sellerId,
      reason: "purchase",
      quantityDelta: 15,
      beforeQuantityOnHand: 10,
      afterQuantityOnHand: 25,
      performedBy: alice.userId,
      note: "Eid restock",
    });
  });

  it("returns a result the shared contract accepts", async () => {
    const { variantId } = await createTestVariant(alice);

    const response = await as(alice, "post", ADJUSTMENTS).send(adjustment(alice, variantId));

    expect(stockAdjustmentResultSchema.safeParse(response.body.data).success).toBe(true);
  });

  it("is visible through the product API afterwards", async () => {
    // One source of truth: the number the adjustment wrote is the number the
    // catalogue reads.
    const { variantId, productId } = await createTestVariant(alice, { quantity: 10 });

    await as(alice, "post", ADJUSTMENTS).send(
      adjustment(alice, variantId, { targetQuantityOnHand: 0, reason: "damage_loss" }),
    );
    const product = await as(alice, "get", `/api/v1/products/${productId}`);

    expect(product.body.data.variants[0].inventory).toMatchObject({
      quantityOnHand: 0,
      state: "out_of_stock",
    });
  });

  it("takes the acting user from the token and ignores the body", async () => {
    const { variantId } = await createTestVariant(alice);

    const response = await as(alice, "post", ADJUSTMENTS).send(
      adjustment(alice, variantId, { performedBy: bob.userId, sellerId: bob.sellerId }),
    );

    expect(response.status).toBe(201);
    expect(response.body.data.movement.performedBy).toBe(alice.userId);
    expect(response.body.data.movement.sellerId).toBe(alice.sellerId);
  });

  it("rejects a negative target", async () => {
    const { variantId } = await createTestVariant(alice);

    const response = await as(alice, "post", ADJUSTMENTS).send(
      adjustment(alice, variantId, { targetQuantityOnHand: -1 }),
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_error");
    expect(response.body.error.details).toHaveProperty("targetQuantityOnHand");
  });

  it("rejects a fractional target", async () => {
    const { variantId } = await createTestVariant(alice);

    const response = await as(alice, "post", ADJUSTMENTS).send(
      adjustment(alice, variantId, { targetQuantityOnHand: 2.5 }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects an adjustment with no reason", async () => {
    const { variantId } = await createTestVariant(alice);

    const response = await as(alice, "post", ADJUSTMENTS).send(
      adjustment(alice, variantId, { reason: undefined }),
    );

    expect(response.status).toBe(400);
    expect(response.body.error.details).toHaveProperty("reason");
  });

  it("rejects a target below what is already reserved", async () => {
    const { variantId } = await createTestVariant(alice, { quantity: 10, reserved: 6 });

    const response = await as(alice, "post", ADJUSTMENTS).send(
      adjustment(alice, variantId, { targetQuantityOnHand: 5, reason: "correction" }),
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_error");
    expect(response.body.error.details.targetQuantityOnHand[0]).toMatch(/6/);
  });

  it("rejects an adjustment that changes nothing", async () => {
    const { variantId } = await createTestVariant(alice, { quantity: 10 });

    const response = await as(alice, "post", ADJUSTMENTS).send(
      adjustment(alice, variantId, { targetQuantityOnHand: 10 }),
    );

    expect(response.status).toBe(400);
    expect(response.body.error.details).toHaveProperty("targetQuantityOnHand");
  });

  it("rejects a variant that does not track inventory", async () => {
    const { variantId } = await createTestVariant(alice, { trackInventory: false, quantity: null });

    const response = await as(alice, "post", ADJUSTMENTS).send(adjustment(alice, variantId));

    expect(response.status).toBe(400);
    expect(response.body.error.details).toHaveProperty("variantId");
  });

  it("writes nothing when the adjustment is refused", async () => {
    const { variantId, productId } = await createTestVariant(alice, { quantity: 10, reserved: 6 });

    await as(alice, "post", ADJUSTMENTS).send(
      adjustment(alice, variantId, { targetQuantityOnHand: 5 }),
    );

    const product = await as(alice, "get", `/api/v1/products/${productId}`);
    const history = await as(alice, "get", MOVEMENTS).query({ workspaceId: alice.workspaceId });

    expect(product.body.data.variants[0].inventory.quantityOnHand).toBe(10);
    expect(history.body.data).toHaveLength(0);
  });

  it("returns 404 for another seller's variant and leaves it untouched", async () => {
    const bobs = await createTestVariant(bob, { quantity: 10 });

    const response = await as(alice, "post", ADJUSTMENTS).send(
      // Alice's own workspace, Bob's variant.
      adjustment(alice, bobs.variantId, { targetQuantityOnHand: 99 }),
    );

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("not_found");

    const product = await as(bob, "get", `/api/v1/products/${bobs.productId}`);
    expect(product.body.data.variants[0].inventory.quantityOnHand).toBe(10);
  });

  it("returns 404 when naming another seller's workspace", async () => {
    const bobs = await createTestVariant(bob, { quantity: 10 });

    const response = await as(alice, "post", ADJUSTMENTS).send(
      adjustment(bob, bobs.variantId, { targetQuantityOnHand: 99 }),
    );

    expect(response.status).toBe(404);
  });
});

describe("GET /api/v1/inventory/movements", () => {
  async function adjust(seller: TestSeller, variantId: string, target: number, reason: string) {
    const response = await as(seller, "post", ADJUSTMENTS).send(
      adjustment(seller, variantId, { targetQuantityOnHand: target, reason }),
    );
    expect(response.status).toBe(201);
  }

  it("lists movements newest first", async () => {
    const { variantId } = await createTestVariant(alice, { quantity: 10 });
    await adjust(alice, variantId, 15, "purchase");
    await adjust(alice, variantId, 12, "sale");
    await adjust(alice, variantId, 11, "damage_loss");

    const response = await as(alice, "get", MOVEMENTS).query({ workspaceId: alice.workspaceId });

    expect(response.status).toBe(200);
    expect(response.body.data.map((m: { reason: string }) => m.reason)).toEqual([
      "damage_loss",
      "sale",
      "purchase",
    ]);
    expect(response.body.meta).toEqual({ page: 1, pageSize: 25, total: 3 });
    expect(response.body.nextCursor).toBeNull();
  });

  it("returns movements the shared contract accepts", async () => {
    const { variantId } = await createTestVariant(alice, { quantity: 10 });
    await adjust(alice, variantId, 15, "purchase");

    const response = await as(alice, "get", MOVEMENTS).query({ workspaceId: alice.workspaceId });

    expect(stockMovementSchema.safeParse(response.body.data[0]).success).toBe(true);
  });

  it("filters by variant", async () => {
    const kurta = await createTestVariant(alice, { quantity: 10 });
    const shalwar = await createTestVariant(alice, { quantity: 10 });
    await adjust(alice, kurta.variantId, 15, "purchase");
    await adjust(alice, shalwar.variantId, 8, "sale");

    const response = await as(alice, "get", MOVEMENTS).query({
      workspaceId: alice.workspaceId,
      variantId: shalwar.variantId,
    });

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].variantId).toBe(shalwar.variantId);
  });

  it("filters by reason", async () => {
    const { variantId } = await createTestVariant(alice, { quantity: 10 });
    await adjust(alice, variantId, 15, "purchase");
    await adjust(alice, variantId, 12, "sale");
    await adjust(alice, variantId, 11, "damage_loss");

    const response = await as(alice, "get", MOVEMENTS).query({
      workspaceId: alice.workspaceId,
      reasons: "sale,damage_loss",
    });

    expect(response.body.data.map((m: { reason: string }) => m.reason).sort()).toEqual([
      "damage_loss",
      "sale",
    ]);
  });

  it("pages forward with the cursor", async () => {
    const { variantId } = await createTestVariant(alice, { quantity: 10 });
    await adjust(alice, variantId, 15, "purchase");
    await adjust(alice, variantId, 12, "sale");
    await adjust(alice, variantId, 11, "damage_loss");

    const first = await as(alice, "get", MOVEMENTS).query({
      workspaceId: alice.workspaceId,
      limit: 2,
    });
    const second = await as(alice, "get", MOVEMENTS).query({
      workspaceId: alice.workspaceId,
      limit: 2,
      cursor: first.body.nextCursor,
    });

    expect(first.body.data).toHaveLength(2);
    expect(first.body.meta).toEqual({ page: 1, pageSize: 2, total: 3 });
    expect(second.body.data).toHaveLength(1);
    expect(second.body.data[0].reason).toBe("purchase");
    expect(second.body.nextCursor).toBeNull();
  });

  it("requires a workspace", async () => {
    const response = await as(alice, "get", MOVEMENTS);

    expect(response.status).toBe(400);
    expect(response.body.error.details).toHaveProperty("workspaceId");
  });

  it("rejects an unknown reason filter", async () => {
    const response = await as(alice, "get", MOVEMENTS).query({
      workspaceId: alice.workspaceId,
      reasons: "stolen",
    });

    expect(response.status).toBe(400);
  });

  it("never shows another seller's movements", async () => {
    const bobs = await createTestVariant(bob, { quantity: 10 });
    await adjust(bob, bobs.variantId, 15, "purchase");

    // Alice asks for Bob's workspace by id. RLS returns nothing rather than an
    // error, so she cannot even learn that the workspace exists.
    const response = await as(alice, "get", MOVEMENTS).query({ workspaceId: bob.workspaceId });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(0);
    expect(response.body.meta.total).toBe(0);
  });
});
