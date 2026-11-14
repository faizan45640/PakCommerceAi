/**
 * Tier 2 — draft/manual order API end to end.
 *
 * Real Express app, real JWTs, real Postgres with RLS. Drafts must not touch
 * stock. Requires the local Supabase stack: `npx supabase start`.
 */

import { orderListItemSchema, orderSchema } from "@pakcommerce/shared";
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
    expect(response.body.data.id).toBe(created.body.data.id);
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
    expect(orderSchema.safeParse(response.body.data).success).toBe(true);

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
