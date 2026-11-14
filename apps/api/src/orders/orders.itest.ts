/**
 * Tier 2 — draft/manual order API end to end.
 *
 * Real Express app, real JWTs, real Postgres with RLS. Drafts must not touch
 * stock. Requires the local Supabase stack: `npx supabase start`.
 */

import {
  MAX_MONEY_MINOR,
  MAX_ORDER_ITEM_QUANTITY,
  orderDetailSchema,
  orderListItemSchema,
  orderSchema,
} from "@pakcommerce/shared";
import { randomUUID } from "node:crypto";

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
import {
  createSupabaseAdminClient,
} from "@pakcommerce/integrations/supabase";
import {
  LOCAL_ANON_KEY,
  LOCAL_SERVICE_ROLE_KEY,
  LOCAL_SUPABASE_URL,
} from "../testing/api-test-env.js";

const app = () => createApp();
const ORDERS = "/api/v1/orders";

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

function draftBody(
  seller: TestSeller,
  productId: string,
  variantId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    workspaceId: seller.workspaceId,
    channel: "manual",
    customer: {
      name: "Ayesha Khan",
      phone: "+923001112233",
      city: "Lahore",
    },
    items: [
      {
        productId,
        variantId,
        quantity: 2,
      },
    ],
    ...overrides,
  };
}

describe("authentication", () => {
  it("rejects create with no token", async () => {
    const { productId, variantId } = await createTestVariant(alice);

    const response = await request(app())
      .post(ORDERS)
      .send(draftBody(alice, productId, variantId));

    expect(response.status).toBe(401);
  });

  it("rejects list with no token", async () => {
    const response = await request(app())
      .get(ORDERS)
      .query({ workspaceId: alice.workspaceId });

    expect(response.status).toBe(401);
  });
});

describe("POST /api/v1/orders", () => {
  it("creates a draft with snapped line prices and initial history", async () => {
    const { productId, variantId } = await createTestVariant(alice, {
      quantity: 10,
    });

    const response = await as(alice, "post", ORDERS).send(
      draftBody(alice, productId, variantId, { note: "WhatsApp intake" }),
    );

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      status: "draft",
      channel: "manual",
      paymentMethod: "cod",
      customer: {
        name: "Ayesha Khan",
        phone: "+923001112233",
        city: "Lahore",
      },
      note: "WhatsApp intake",
      confirmedAt: null,
      subtotal: { amountMinor: 500000, currency: "PKR" },
      total: { amountMinor: 500000, currency: "PKR" },
    });
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({
      productId,
      variantId,
      quantity: 2,
      unitPrice: { amountMinor: 250000 },
      lineTotal: { amountMinor: 500000 },
    });
    expect(orderSchema.safeParse(response.body.data).success).toBe(true);

    // Stock must not move on draft create.
    const admin = createSupabaseAdminClient({
      url: LOCAL_SUPABASE_URL,
      anonKey: LOCAL_ANON_KEY,
      serviceRoleKey: LOCAL_SERVICE_ROLE_KEY,
    });
    const { data: variant } = await admin
      .from("product_variants")
      .select("quantity_on_hand, reserved_quantity")
      .eq("id", variantId)
      .single();
    expect(variant).toMatchObject({
      quantity_on_hand: 10,
      reserved_quantity: 0,
    });

    const { data: history } = await admin
      .from("order_status_history")
      .select("from_status, to_status")
      .eq("order_id", response.body.data.id);
    expect(history).toEqual([{ from_status: null, to_status: "draft" }]);
  });

  it("rejects a variant that is not in the workspace", async () => {
    const aliceVariant = await createTestVariant(alice);
    const bobVariant = await createTestVariant(bob);

    const response = await as(alice, "post", ORDERS).send(
      draftBody(alice, aliceVariant.productId, bobVariant.variantId),
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_error");
    expect(response.body.error.details).toHaveProperty(["items.0.variantId"]);
  });

  it("rejects a productId that does not match the variant", async () => {
    const first = await createTestVariant(alice);
    const second = await createTestVariant(alice);

    const response = await as(alice, "post", ORDERS).send(
      draftBody(alice, second.productId, first.variantId),
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_error");
  });

  it("rejects an empty items array", async () => {
    const response = await as(alice, "post", ORDERS).send({
      workspaceId: alice.workspaceId,
      customer: {
        name: "Ayesha Khan",
        phone: "+923001112233",
        city: "Lahore",
      },
      items: [],
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_error");
  });
});

describe("GET /api/v1/orders", () => {
  it("lists only the seller's drafts", async () => {
    const aliceVariant = await createTestVariant(alice);
    const bobVariant = await createTestVariant(bob);

    await as(alice, "post", ORDERS).send(
      draftBody(alice, aliceVariant.productId, aliceVariant.variantId),
    );
    await as(bob, "post", ORDERS).send(
      draftBody(bob, bobVariant.productId, bobVariant.variantId),
    );

    const response = await as(alice, "get", ORDERS).query({
      workspaceId: alice.workspaceId,
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.meta.total).toBe(1);
    expect(orderListItemSchema.safeParse(response.body.data[0]).success).toBe(
      true,
    );
    expect(response.body.data[0].itemCount).toBe(1);
  });

  it("filters by status", async () => {
    const { productId, variantId } = await createTestVariant(alice);
    await as(alice, "post", ORDERS).send(draftBody(alice, productId, variantId));

    const drafts = await as(alice, "get", ORDERS).query({
      workspaceId: alice.workspaceId,
      statuses: "draft",
    });
    const confirmed = await as(alice, "get", ORDERS).query({
      workspaceId: alice.workspaceId,
      statuses: "confirmed",
    });

    expect(drafts.body.data).toHaveLength(1);
    expect(confirmed.body.data).toHaveLength(0);
  });
});

describe("GET /api/v1/orders/:orderId", () => {
  it("returns the full order for the owner", async () => {
    const { productId, variantId } = await createTestVariant(alice);
    const created = await as(alice, "post", ORDERS).send(
      draftBody(alice, productId, variantId),
    );

    const response = await as(alice, "get", `${ORDERS}/${created.body.data.id}`).query({
      workspaceId: alice.workspaceId,
    });

    expect(response.status).toBe(200);
    expect(orderSchema.safeParse(response.body.data).success).toBe(true);
    expect(orderDetailSchema.safeParse(response.body.data).success).toBe(true);
    expect(response.body.data.id).toBe(created.body.data.id);
  });

  it("includes initial history and a sufficient stock check for a draft", async () => {
    const { productId, variantId } = await createTestVariant(alice, {
      quantity: 10,
    });
    const created = await as(alice, "post", ORDERS).send(
      draftBody(alice, productId, variantId),
    );

    const response = await as(alice, "get", `${ORDERS}/${created.body.data.id}`).query({
      workspaceId: alice.workspaceId,
    });

    expect(response.body.data.statusHistory).toHaveLength(1);
    expect(response.body.data.statusHistory[0]).toMatchObject({
      fromStatus: null,
      toStatus: "draft",
    });
    expect(response.body.data.stockChecks).toEqual([
      expect.objectContaining({
        variantId,
        productId,
        needed: 2,
        available: 10,
        sufficient: true,
      }),
    ]);
  });

  it("reports insufficient stock on a draft when stock is short", async () => {
    const { productId, variantId } = await createTestVariant(alice, {
      quantity: 1,
    });
    const created = await as(alice, "post", ORDERS).send(
      draftBody(alice, productId, variantId),
    );

    const response = await as(alice, "get", `${ORDERS}/${created.body.data.id}`).query({
      workspaceId: alice.workspaceId,
    });

    expect(response.body.data.stockChecks).toEqual([
      expect.objectContaining({ needed: 2, available: 1, sufficient: false }),
    ]);
  });

  it("treats an untracked variant as sufficient with null available", async () => {
    const { productId, variantId } = await createTestVariant(alice, {
      trackInventory: false,
      quantity: null,
    });
    const created = await as(alice, "post", ORDERS).send(
      draftBody(alice, productId, variantId),
    );

    const response = await as(alice, "get", `${ORDERS}/${created.body.data.id}`).query({
      workspaceId: alice.workspaceId,
    });

    expect(response.body.data.stockChecks).toEqual([
      expect.objectContaining({ needed: 2, available: null, sufficient: true }),
    ]);
  });

  it("returns 404 for another seller's order", async () => {
    const { productId, variantId } = await createTestVariant(alice);
    const created = await as(alice, "post", ORDERS).send(
      draftBody(alice, productId, variantId),
    );

    const response = await as(bob, "get", `${ORDERS}/${created.body.data.id}`).query({
      workspaceId: bob.workspaceId,
    });

    expect(response.status).toBe(404);
  });
});

describe("POST /api/v1/orders/:orderId/transition", () => {
  it("confirms a draft and deducts stock with a sale movement", async () => {
    const { productId, variantId } = await createTestVariant(alice, {
      quantity: 10,
    });
    const created = await as(alice, "post", ORDERS).send(
      draftBody(alice, productId, variantId, {
        customer: {
          name: "Ayesha Khan",
          phone: "+923001112233",
          city: "Lahore",
          addressLine: "House 12, DHA Phase 5",
        },
        items: [{ productId, variantId, quantity: 2 }],
      }),
    );

    const response = await as(
      alice,
      "post",
      `${ORDERS}/${created.body.data.id}/transition`,
    ).send({
      workspaceId: alice.workspaceId,
      toStatus: "confirmed",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("confirmed");
    expect(response.body.data.confirmedAt).toBeTruthy();
    expect(orderDetailSchema.safeParse(response.body.data).success).toBe(true);
    expect(
      response.body.data.statusHistory.map(
        (h: { fromStatus: string | null; toStatus: string }) =>
          `${h.fromStatus}>${h.toStatus}`,
      ),
    ).toEqual(["null>draft", "draft>confirmed"]);
    // Stock checks are for drafts only.
    expect(response.body.data.stockChecks).toEqual([]);

    const admin = createSupabaseAdminClient({
      url: LOCAL_SUPABASE_URL,
      anonKey: LOCAL_ANON_KEY,
      serviceRoleKey: LOCAL_SERVICE_ROLE_KEY,
    });
    const { data: variant } = await admin
      .from("product_variants")
      .select("quantity_on_hand, reserved_quantity")
      .eq("id", variantId)
      .single();
    expect(variant).toMatchObject({
      quantity_on_hand: 8,
      reserved_quantity: 0,
    });

    const { data: movements } = await admin
      .from("stock_movements")
      .select("reason, quantity_delta")
      .eq("variant_id", variantId)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(movements?.[0]).toMatchObject({
      reason: "sale",
      quantity_delta: -2,
    });
  });

  it("leaves the order in draft when stock is insufficient", async () => {
    const { productId, variantId } = await createTestVariant(alice, {
      quantity: 1,
    });
    const created = await as(alice, "post", ORDERS).send(
      draftBody(alice, productId, variantId, {
        customer: {
          name: "Ayesha Khan",
          phone: "+923001112233",
          city: "Lahore",
          addressLine: "House 12",
        },
        items: [{ productId, variantId, quantity: 5 }],
      }),
    );

    const response = await as(
      alice,
      "post",
      `${ORDERS}/${created.body.data.id}/transition`,
    ).send({
      workspaceId: alice.workspaceId,
      toStatus: "confirmed",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_error");

    const get = await as(alice, "get", `${ORDERS}/${created.body.data.id}`).query({
      workspaceId: alice.workspaceId,
    });
    expect(get.body.data.status).toBe("draft");
  });

  it("cancels a draft without touching stock", async () => {
    const { productId, variantId } = await createTestVariant(alice, {
      quantity: 10,
    });
    const created = await as(alice, "post", ORDERS).send(
      draftBody(alice, productId, variantId),
    );

    const response = await as(
      alice,
      "post",
      `${ORDERS}/${created.body.data.id}/transition`,
    ).send({
      workspaceId: alice.workspaceId,
      toStatus: "cancelled",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("cancelled");

    const admin = createSupabaseAdminClient({
      url: LOCAL_SUPABASE_URL,
      anonKey: LOCAL_ANON_KEY,
      serviceRoleKey: LOCAL_SERVICE_ROLE_KEY,
    });
    const { data: variant } = await admin
      .from("product_variants")
      .select("quantity_on_hand")
      .eq("id", variantId)
      .single();
    expect(variant?.quantity_on_hand).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// T-042: order workflow coverage - create, status update, draft, stock deduction,
// failed stock. Fixtures are arranged with the service role; every behaviour under
// test goes through the real API as the seller.
// ---------------------------------------------------------------------------

const adminClient = () =>
  createSupabaseAdminClient({
    url: LOCAL_SUPABASE_URL,
    anonKey: LOCAL_ANON_KEY,
    serviceRoleKey: LOCAL_SERVICE_ROLE_KEY,
  });

const ADDRESS = "House 12, DHA Phase 5";

interface Line {
  productId: string;
  variantId: string;
  quantity: number;
}

async function createDraft(
  seller: TestSeller,
  items: Line[],
  options: { address?: string | null } = {},
): Promise<string> {
  const address = options.address === undefined ? ADDRESS : options.address;
  const response = await as(seller, "post", ORDERS).send({
    workspaceId: seller.workspaceId,
    channel: "manual",
    customer: {
      name: "Ayesha Khan",
      phone: "+923001112233",
      city: "Lahore",
      ...(address === null ? {} : { addressLine: address }),
    },
    items,
  });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

function transition(seller: TestSeller, orderId: string, toStatus: string, note?: string) {
  return as(seller, "post", `${ORDERS}/${orderId}/transition`).send({
    workspaceId: seller.workspaceId,
    toStatus,
    ...(note === undefined ? {} : { note }),
  });
}

async function getDetail(seller: TestSeller, orderId: string) {
  const response = await as(seller, "get", `${ORDERS}/${orderId}`).query({
    workspaceId: seller.workspaceId,
  });
  expect(response.status).toBe(200);
  return response.body.data;
}

async function stockOf(variantId: string) {
  const { data, error } = await adminClient()
    .from("product_variants")
    .select("quantity_on_hand, reserved_quantity")
    .eq("id", variantId)
    .single();
  expect(error).toBeNull();
  return data;
}

async function movementsOf(variantId: string) {
  const { data, error } = await adminClient()
    .from("stock_movements")
    .select("reason, quantity_delta, before_quantity_on_hand, after_quantity_on_hand")
    .eq("variant_id", variantId);
  expect(error).toBeNull();
  return data ?? [];
}

async function historyOf(orderId: string) {
  const { data, error } = await adminClient()
    .from("order_status_history")
    .select("from_status, to_status, note")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  expect(error).toBeNull();
  return data ?? [];
}

async function orderRow(orderId: string) {
  const { data, error } = await adminClient()
    .from("orders")
    .select("status, confirmed_at, cancelled_at")
    .eq("id", orderId)
    .single();
  expect(error).toBeNull();
  return data;
}

describe("T-042 create order", () => {
  it("creates a manual draft with every field, snapshotted prices and shipping in the total", async () => {
    const first = await createTestVariant(alice, { quantity: 10 });
    const second = await createTestVariant(alice, { quantity: 10 });

    const response = await as(alice, "post", ORDERS).send({
      workspaceId: alice.workspaceId,
      channel: "manual",
      paymentMethod: "cod",
      shippingFee: { amountMinor: 30000, currency: "PKR" },
      customer: {
        name: "Ayesha Khan",
        phone: "+923001112233",
        city: "Lahore",
        email: "ayesha@example.com",
        addressLine: ADDRESS,
      },
      items: [
        { productId: first.productId, variantId: first.variantId, quantity: 2 },
        { productId: second.productId, variantId: second.variantId, quantity: 1 },
      ],
      note: "Call before delivery",
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      status: "draft",
      channel: "manual",
      paymentMethod: "cod",
      customer: {
        name: "Ayesha Khan",
        phone: "+923001112233",
        city: "Lahore",
        email: "ayesha@example.com",
        addressLine: ADDRESS,
      },
      note: "Call before delivery",
      shippingFee: { amountMinor: 30000 },
      subtotal: { amountMinor: 750000 },
      total: { amountMinor: 780000 },
    });
    expect(response.body.data.items).toHaveLength(2);
    expect(orderSchema.safeParse(response.body.data).success).toBe(true);

    const detail = await getDetail(alice, response.body.data.id);
    expect(detail.statusHistory).toHaveLength(1);
    expect(detail.statusHistory[0]).toMatchObject({ fromStatus: null, toStatus: "draft" });
  });

  it("snapshots the catalogue price so a later price change does not alter the order", async () => {
    const { productId, variantId } = await createTestVariant(alice);
    const orderId = await createDraft(alice, [{ productId, variantId, quantity: 2 }]);

    await adminClient()
      .from("product_variants")
      .update({ price_amount_minor: 999900 })
      .eq("id", variantId);

    const detail = await getDetail(alice, orderId);
    expect(detail.items[0].unitPrice.amountMinor).toBe(250000);
    expect(detail.subtotal.amountMinor).toBe(500000);
  });

  it("rejects a missing customer phone with the field path", async () => {
    const { productId, variantId } = await createTestVariant(alice);

    const response = await as(alice, "post", ORDERS).send(
      draftBody(alice, productId, variantId, {
        customer: { name: "Ayesha Khan", city: "Lahore" },
      }),
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_error");
    expect(response.body.error.details).toHaveProperty(["customer.phone"]);
  });

  it("rejects quantity 0 with the field path", async () => {
    const { productId, variantId } = await createTestVariant(alice);

    const response = await as(alice, "post", ORDERS).send(
      draftBody(alice, productId, variantId, {
        items: [{ productId, variantId, quantity: 0 }],
      }),
    );

    expect(response.status).toBe(400);
    expect(response.body.error.details).toHaveProperty(["items.0.quantity"]);
  });

  it("rejects a quantity above MAX_ORDER_ITEM_QUANTITY with the field path", async () => {
    const { productId, variantId } = await createTestVariant(alice);

    const response = await as(alice, "post", ORDERS).send(
      draftBody(alice, productId, variantId, {
        items: [{ productId, variantId, quantity: MAX_ORDER_ITEM_QUANTITY + 1 }],
      }),
    );

    expect(response.status).toBe(400);
    expect(response.body.error.details).toHaveProperty(["items.0.quantity"]);
  });

  it("rejects a shipping fee above MAX_MONEY_MINOR with the field path", async () => {
    const { productId, variantId } = await createTestVariant(alice);

    const response = await as(alice, "post", ORDERS).send(
      draftBody(alice, productId, variantId, {
        shippingFee: { amountMinor: MAX_MONEY_MINOR + 1, currency: "PKR" },
      }),
    );

    expect(response.status).toBe(400);
    expect(response.body.error.details).toHaveProperty(["shippingFee.amountMinor"]);
  });

  it("rejects a line total that overflows the money limit instead of failing with a 500", async () => {
    const { productId, variantId } = await createTestVariant(alice);

    const response = await as(alice, "post", ORDERS).send(
      draftBody(alice, productId, variantId, {
        items: [{ productId, variantId, quantity: MAX_ORDER_ITEM_QUANTITY }],
      }),
    );

    expect(response.status).toBe(400);
    expect(response.body.error.details).toHaveProperty(["items.0.quantity"]);
  });

  it("rejects an unknown variant with the field path and creates nothing", async () => {
    const { productId } = await createTestVariant(alice);

    const response = await as(alice, "post", ORDERS).send(
      draftBody(alice, productId, randomUUID()),
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_error");
    expect(response.body.error.details).toHaveProperty(["items.0.variantId"]);

    const list = await as(alice, "get", ORDERS).query({ workspaceId: alice.workspaceId });
    expect(list.body.data).toHaveLength(0);
  });
});

describe("T-042 status update", () => {
  it("cancels a draft with a note, sets cancelled_at, and leaves stock and movements alone", async () => {
    const { productId, variantId } = await createTestVariant(alice, { quantity: 10 });
    const orderId = await createDraft(alice, [{ productId, variantId, quantity: 3 }]);

    const response = await transition(alice, orderId, "cancelled", "Customer changed mind");

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("cancelled");
    expect(response.body.data.cancelledAt).toBeTruthy();
    expect(response.body.data.confirmedAt).toBeNull();
    expect(await historyOf(orderId)).toEqual([
      { from_status: null, to_status: "draft", note: null },
      { from_status: "draft", to_status: "cancelled", note: "Customer changed mind" },
    ]);
    expect((await orderRow(orderId))?.cancelled_at).toBeTruthy();
    expect(await stockOf(variantId)).toMatchObject({ quantity_on_hand: 10, reserved_quantity: 0 });
    expect(await movementsOf(variantId)).toEqual([]);
  });

  describe("refused transitions change nothing", () => {
    async function expectUnchanged(orderId: string, variantId: string, status: string, historyLength: number, onHand: number) {
      expect((await orderRow(orderId))?.status).toBe(status);
      expect(await historyOf(orderId)).toHaveLength(historyLength);
      expect((await stockOf(variantId))?.quantity_on_hand).toBe(onHand);
    }

    it("refuses cancelled to confirmed", async () => {
      const { productId, variantId } = await createTestVariant(alice, { quantity: 10 });
      const orderId = await createDraft(alice, [{ productId, variantId, quantity: 2 }]);
      expect((await transition(alice, orderId, "cancelled")).status).toBe(200);

      const response = await transition(alice, orderId, "confirmed");

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("validation_error");
      expect(response.body.error.details).toHaveProperty(["toStatus"]);
      await expectUnchanged(orderId, variantId, "cancelled", 2, 10);
      expect(await movementsOf(variantId)).toEqual([]);
    });

    it("refuses confirming a confirmed order twice and deducts only once", async () => {
      const { productId, variantId } = await createTestVariant(alice, { quantity: 10 });
      const orderId = await createDraft(alice, [{ productId, variantId, quantity: 2 }]);
      expect((await transition(alice, orderId, "confirmed")).status).toBe(200);

      const response = await transition(alice, orderId, "confirmed");

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("validation_error");
      await expectUnchanged(orderId, variantId, "confirmed", 2, 8);
      expect(await movementsOf(variantId)).toHaveLength(1);
    });

    it("refuses confirmed to shipped because fulfilment is not enabled yet", async () => {
      const { productId, variantId } = await createTestVariant(alice, { quantity: 10 });
      const orderId = await createDraft(alice, [{ productId, variantId, quantity: 2 }]);
      expect((await transition(alice, orderId, "confirmed")).status).toBe(200);

      const response = await transition(alice, orderId, "shipped");

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("validation_error");
      await expectUnchanged(orderId, variantId, "confirmed", 2, 8);
    });

    it("refuses toStatus draft at the contract and changes nothing", async () => {
      const { productId, variantId } = await createTestVariant(alice, { quantity: 10 });
      const orderId = await createDraft(alice, [{ productId, variantId, quantity: 2 }]);

      const response = await transition(alice, orderId, "draft");

      expect(response.status).toBe(400);
      expect(response.body.error.details).toHaveProperty(["toStatus"]);
      await expectUnchanged(orderId, variantId, "draft", 1, 10);
    });
  });

  it("returns 404 when another seller tries to transition the order, and changes nothing", async () => {
    const { productId, variantId } = await createTestVariant(alice, { quantity: 10 });
    const orderId = await createDraft(alice, [{ productId, variantId, quantity: 2 }]);

    const response = await transition(bob, orderId, "confirmed");

    expect(response.status).toBe(404);
    expect((await orderRow(orderId))?.status).toBe("draft");
    expect((await stockOf(variantId))?.quantity_on_hand).toBe(10);
    expect(await movementsOf(variantId)).toEqual([]);
  });
});

describe("T-042 draft orders never touch stock", () => {
  it("leaves on-hand, reserved and movements alone across several drafts", async () => {
    const { productId, variantId } = await createTestVariant(alice, {
      quantity: 10,
      reserved: 3,
    });

    await createDraft(alice, [{ productId, variantId, quantity: 4 }]);
    await createDraft(alice, [{ productId, variantId, quantity: 50 }]);

    expect(await stockOf(variantId)).toMatchObject({ quantity_on_hand: 10, reserved_quantity: 3 });
    expect(await movementsOf(variantId)).toEqual([]);
  });
});

describe("T-042 confirmed stock deduction", () => {
  it("deducts one line and records the sale movement with before/after quantities", async () => {
    const { productId, variantId } = await createTestVariant(alice, { quantity: 10 });
    const orderId = await createDraft(alice, [{ productId, variantId, quantity: 3 }]);

    const response = await transition(alice, orderId, "confirmed");

    expect(response.status).toBe(200);
    expect(response.body.data.confirmedAt).toBeTruthy();
    expect((await orderRow(orderId))?.confirmed_at).toBeTruthy();
    expect(await stockOf(variantId)).toMatchObject({ quantity_on_hand: 7, reserved_quantity: 0 });
    expect(await movementsOf(variantId)).toEqual([
      {
        reason: "sale",
        quantity_delta: -3,
        before_quantity_on_hand: 10,
        after_quantity_on_hand: 7,
      },
    ]);
    expect(await historyOf(orderId)).toEqual([
      { from_status: null, to_status: "draft", note: null },
      { from_status: "draft", to_status: "confirmed", note: null },
    ]);
    expect((await getDetail(alice, orderId)).stockChecks).toEqual([]);
  });

  it("sums two lines of the same variant and deducts once with a single movement", async () => {
    const { productId, variantId } = await createTestVariant(alice, { quantity: 10 });
    const orderId = await createDraft(alice, [
      { productId, variantId, quantity: 2 },
      { productId, variantId, quantity: 3 },
    ]);

    const response = await transition(alice, orderId, "confirmed");

    expect(response.status).toBe(200);
    expect((await stockOf(variantId))?.quantity_on_hand).toBe(5);
    expect(await movementsOf(variantId)).toEqual([
      {
        reason: "sale",
        quantity_delta: -5,
        before_quantity_on_hand: 10,
        after_quantity_on_hand: 5,
      },
    ]);
  });

  it("writes one sale movement per distinct variant", async () => {
    const first = await createTestVariant(alice, { quantity: 10 });
    const second = await createTestVariant(alice, { quantity: 4 });
    const orderId = await createDraft(alice, [
      { productId: first.productId, variantId: first.variantId, quantity: 2 },
      { productId: second.productId, variantId: second.variantId, quantity: 4 },
    ]);

    expect((await transition(alice, orderId, "confirmed")).status).toBe(200);

    expect((await stockOf(first.variantId))?.quantity_on_hand).toBe(8);
    expect((await stockOf(second.variantId))?.quantity_on_hand).toBe(0);
    expect(await movementsOf(first.variantId)).toHaveLength(1);
    expect(await movementsOf(second.variantId)).toHaveLength(1);
  });

  it("respects reserved stock: available is on-hand minus reserved and reserved is kept", async () => {
    const { productId, variantId } = await createTestVariant(alice, {
      quantity: 10,
      reserved: 4,
    });
    const orderId = await createDraft(alice, [{ productId, variantId, quantity: 6 }]);

    expect((await getDetail(alice, orderId)).stockChecks[0]).toMatchObject({
      needed: 6,
      available: 6,
      sufficient: true,
    });
    expect((await transition(alice, orderId, "confirmed")).status).toBe(200);
    expect(await stockOf(variantId)).toMatchObject({ quantity_on_hand: 4, reserved_quantity: 4 });
  });

  it("confirms an untracked variant with no stock change and no movement", async () => {
    const { productId, variantId } = await createTestVariant(alice, {
      trackInventory: false,
      quantity: null,
    });
    const orderId = await createDraft(alice, [{ productId, variantId, quantity: 5 }]);

    const response = await transition(alice, orderId, "confirmed");

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("confirmed");
    expect((await stockOf(variantId))?.quantity_on_hand).toBeNull();
    expect(await movementsOf(variantId)).toEqual([]);
  });
});

describe("T-042 failed stock cases", () => {
  it("refuses insufficient stock with details and changes nothing", async () => {
    const { productId, variantId } = await createTestVariant(alice, { quantity: 1 });
    const orderId = await createDraft(alice, [{ productId, variantId, quantity: 5 }]);

    const response = await transition(alice, orderId, "confirmed");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_error");
    expect(response.body.error.details.items[0]).toContain(variantId);
    expect(response.body.error.details.items[0]).toContain("1 available");
    expect(response.body.error.details.items[0]).toContain("5 needed");
    expect(await orderRow(orderId)).toMatchObject({ status: "draft", confirmed_at: null });
    expect(await movementsOf(variantId)).toEqual([]);
    expect((await stockOf(variantId))?.quantity_on_hand).toBe(1);
    expect(await historyOf(orderId)).toHaveLength(1);
  });

  it("is atomic across lines: a short second line leaves the first line's stock untouched", async () => {
    const enough = await createTestVariant(alice, { quantity: 10 });
    const short = await createTestVariant(alice, { quantity: 1 });
    const orderId = await createDraft(alice, [
      { productId: enough.productId, variantId: enough.variantId, quantity: 2 },
      { productId: short.productId, variantId: short.variantId, quantity: 5 },
    ]);

    const response = await transition(alice, orderId, "confirmed");

    expect(response.status).toBe(400);
    expect((await orderRow(orderId))?.status).toBe("draft");
    expect((await stockOf(enough.variantId))?.quantity_on_hand).toBe(10);
    expect((await stockOf(short.variantId))?.quantity_on_hand).toBe(1);
    expect(await movementsOf(enough.variantId)).toEqual([]);
    expect(await movementsOf(short.variantId)).toEqual([]);
    expect(await historyOf(orderId)).toHaveLength(1);
  });

  it("refuses a draft without a delivery address with address_required details", async () => {
    const { productId, variantId } = await createTestVariant(alice, { quantity: 10 });
    const orderId = await createDraft(alice, [{ productId, variantId, quantity: 2 }], {
      address: null,
    });

    const response = await transition(alice, orderId, "confirmed");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_error");
    expect(response.body.error.details).toHaveProperty(["customer.addressLine"]);
    expect((await orderRow(orderId))?.status).toBe("draft");
    expect((await stockOf(variantId))?.quantity_on_hand).toBe(10);
    expect(await movementsOf(variantId)).toEqual([]);
  });

  it("lets only the first of two drafts claim the last units", async () => {
    const { productId, variantId } = await createTestVariant(alice, { quantity: 5 });
    const first = await createDraft(alice, [{ productId, variantId, quantity: 3 }]);
    const second = await createDraft(alice, [{ productId, variantId, quantity: 3 }]);

    expect((await transition(alice, first, "confirmed")).status).toBe(200);
    const refused = await transition(alice, second, "confirmed");

    expect(refused.status).toBe(400);
    expect((await orderRow(first))?.status).toBe("confirmed");
    expect((await orderRow(second))?.status).toBe("draft");
    expect((await stockOf(variantId))?.quantity_on_hand).toBe(2);
    expect(await movementsOf(variantId)).toHaveLength(1);
    expect(await historyOf(second)).toHaveLength(1);
  });
});

describe("T-042 detail stock warning agrees with confirm", () => {
  const cases: {
    name: string;
    stock: { quantity: number; reserved?: number };
    lines: number[];
    sufficient: boolean;
  }[] = [
    { name: "plain stock is enough", stock: { quantity: 10 }, lines: [4], sufficient: true },
    { name: "plain stock is short", stock: { quantity: 3 }, lines: [4], sufficient: false },
    { name: "reserved stock leaves exactly enough", stock: { quantity: 10, reserved: 4 }, lines: [6], sufficient: true },
    { name: "reserved stock leaves too little", stock: { quantity: 10, reserved: 4 }, lines: [7], sufficient: false },
    { name: "summed lines fit exactly", stock: { quantity: 5 }, lines: [2, 3], sufficient: true },
    { name: "summed lines exceed stock though each line fits", stock: { quantity: 4 }, lines: [2, 3], sufficient: false },
  ];

  it.each(cases)("$name", async ({ stock, lines, sufficient }) => {
    const { productId, variantId } = await createTestVariant(alice, stock);
    const orderId = await createDraft(
      alice,
      lines.map((quantity) => ({ productId, variantId, quantity })),
    );

    const detail = await getDetail(alice, orderId);
    expect(detail.stockChecks.length).toBeGreaterThan(0);
    expect(
      detail.stockChecks.every((check: { sufficient: boolean }) => check.sufficient),
    ).toBe(sufficient);

    const response = await transition(alice, orderId, "confirmed");
    expect(response.status).toBe(sufficient ? 200 : 400);
  });
});
