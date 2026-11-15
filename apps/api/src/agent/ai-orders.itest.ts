/**
 * Tier 2 - S11 WhatsApp AI draft orders (T-085 / T-086) against the real local
 * database: tool permission and state gate, double buyer confirmation enforced
 * in Postgres, auto vs seller-approval confirmation, cross-tenant isolation,
 * the seller approval endpoint, and the new orders / settings columns.
 *
 * Requires the local Supabase stack: `npx supabase start`.
 */

import { randomUUID } from "node:crypto";

import { createSupabaseAdminClient } from "@pakcommerce/integrations/supabase";
import request from "supertest";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { createDraftOrderTool } from "../copilot/tools/write/create-draft-order.js";
import { createApiSupabaseUserClient } from "../lib/supabase.js";
import type { TestSeller } from "../testing/api-test-env.js";
import {
  applyTestEnv,
  createTestSeller,
  createTestVariant,
  deleteTestSeller,
  LOCAL_SERVICE_ROLE_KEY,
  LOCAL_SUPABASE_URL,
} from "../testing/api-test-env.js";
import { getActiveWhatsApp } from "../whatsapp/factory.js";
import type { SimulatorProvider } from "../whatsapp/simulator.js";

const TOKEN = "itest-agent-token";
const agent = (name: string, conversationId: string, input: unknown) =>
  request(createApp())
    .post(`/api/v1/agent/tools/${name}`)
    .set("Authorization", `Bearer ${TOKEN}`)
    .send({ conversationId, input });
const as = (seller: TestSeller, method: "get" | "post" | "put", path: string) =>
  request(createApp())[method](path).set("Authorization", `Bearer ${seller.accessToken}`);

const admin = () =>
  createSupabaseAdminClient({
    url: LOCAL_SUPABASE_URL,
    anonKey: "unused",
    serviceRoleKey: LOCAL_SERVICE_ROLE_KEY,
  });

const BUYER = "+923001234567";
const CUSTOMER = { name: "Ayesha Khan", city: "Lahore", addressLine: "House 12, Street 4, DHA" };

let alice: TestSeller;
let bob: TestSeller;

beforeAll(() => {
  applyTestEnv();
  process.env.AGENT_SERVICE_TOKEN = TOKEN;
  process.env.WHATSAPP_PROVIDER = "simulator";
  delete process.env.WHATSAPP_WORKSPACE_ID;
});

beforeEach(async () => {
  alice = await createTestSeller("alice");
  bob = await createTestSeller("bob");
});

afterEach(async () => {
  await deleteTestSeller(alice);
  await deleteTestSeller(bob);
});

async function shop(seller: TestSeller, quantity = 10) {
  const variant = await createTestVariant(seller, { quantity });
  await admin().from("products").update({ status: "active" }).eq("id", variant.productId);
  return variant;
}

/** One inbound buyer message (creates the thread on first use, ai_active). */
async function inbound(seller: TestSeller, body: string): Promise<string> {
  const response = await as(seller, "post", "/api/v1/conversations/mock-inbound").send({
    workspaceId: seller.workspaceId,
    From: `whatsapp:${BUYER}`,
    ProfileName: "Ayesha Khan",
    Body: body,
    MessageSid: `SM${randomUUID().replace(/-/g, "")}`,
    aiEnabled: true,
  });
  expect([200, 201]).toContain(response.status);
  return response.body.data.conversationId;
}

/** The AI's reply (order number + "HAAN?") is stored, then the buyer answers it. */
async function aiReply(seller: TestSeller, conversationId: string, status: "sent" | "failed" = "sent") {
  const { error } = await admin().from("messages").insert({
    workspace_id: seller.workspaceId,
    seller_id: seller.sellerId,
    conversation_id: conversationId,
    direction: "outbound",
    sender: "ai",
    body: "Order A1B2C3D4, total Rs 5000. Confirm karne ke liye HAAN likhein.",
    media: [],
    status,
  });
  expect(error).toBeNull();
}

async function buyerConfirms(seller: TestSeller, conversationId: string) {
  await aiReply(seller, conversationId);
  await inbound(seller, "HAAN");
}

async function settings(seller: TestSeller, values: { auto_confirm_orders?: boolean; shipping_fee_minor?: number }) {
  const { error } = await admin()
    .from("sales_agent_settings")
    .upsert({ workspace_id: seller.workspaceId, seller_id: seller.sellerId, ...values });
  expect(error).toBeNull();
}

async function draft(conversationId: string, variantId: string, quantity = 2) {
  return agent("createOrderDraft", conversationId, {
    items: [{ variantId, quantity }],
    customer: CUSTOMER,
  });
}

async function stock(variantId: string) {
  const { data } = await admin().from("product_variants").select("quantity_on_hand").eq("id", variantId).single();
  return data?.quantity_on_hand;
}

async function orderRow(orderId: string) {
  const { data } = await admin().from("orders").select("*").eq("id", orderId).single();
  return data;
}

async function conversationRow(id: string) {
  const { data } = await admin().from("conversations").select("state, handoff_reason").eq("id", id).single();
  return data;
}

describe("createOrderDraft", () => {
  it("creates a whatsapp_ai draft from the conversation, priced from the catalogue", async () => {
    const { variantId } = await shop(alice);
    await settings(alice, { shipping_fee_minor: 20000 });
    const conversation = await inbound(alice, "Mujhe 2 kurta chahiye");

    const response = await agent("createOrderDraft", conversation, {
      items: [{ variantId, quantity: 2 }],
      customer: CUSTOMER,
      // Hostile extras are ignored: phone and prices are never the model's to set.
      phone: "+920000000000",
      workspaceId: bob.workspaceId,
    });

    expect(response.status).toBe(200);
    const output = response.body.output;
    expect(output).toMatchObject({
      status: "draft",
      items: [{ product: "Lawn Kurta", variant: "Medium", quantity: 2, unitPricePkr: 2500, lineTotalPkr: 5000 }],
      subtotalPkr: 5000,
      shippingFeePkr: 200,
      totalPkr: 5200,
      paymentMethod: "cod",
      city: "Lahore",
      addressLine: CUSTOMER.addressLine,
    });
    expect(output.orderRef).toBe(output.orderId.slice(0, 8).toUpperCase());
    expect(JSON.stringify(output)).not.toContain("923");

    const row = await orderRow(output.orderId);
    expect(row).toMatchObject({
      status: "draft",
      channel: "whatsapp",
      created_via: "whatsapp_ai",
      conversation_id: conversation,
      customer_phone: BUYER,
      workspace_id: alice.workspaceId,
    });

    // created_by_tool_call_id is the audit row of this very call.
    const { data: calls } = await admin()
      .from("ai_tool_calls")
      .select("id, ok, input")
      .eq("id", row?.created_by_tool_call_id as string);
    expect(calls).toHaveLength(1);
    expect(calls?.[0]?.ok).toBe(true);
    expect(JSON.stringify(calls?.[0]?.input)).not.toContain("Ayesha");
    expect(JSON.stringify(calls?.[0]?.input)).not.toContain("DHA");

    // Nothing moved stock: a draft is not a reservation.
    expect(await stock(variantId)).toBe(10);
  });

  it("is refused unless the AI holds the conversation", async () => {
    const { variantId } = await shop(alice);
    const conversation = await inbound(alice, "order karna hai");
    await admin().from("conversations").update({ state: "human_takeover" }).eq("id", conversation);

    const response = await draft(conversation, variantId);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ai_not_allowed");
    const { data } = await admin().from("orders").select("id").eq("workspace_id", alice.workspaceId);
    expect(data).toEqual([]);
  });

  it("allows only one open draft per conversation (draft_exists names the order)", async () => {
    const { variantId } = await shop(alice);
    const conversation = await inbound(alice, "order");
    const first = await draft(conversation, variantId);
    const second = await draft(conversation, variantId, 1);

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("draft_exists");
    expect(second.body.error.message).toContain(first.body.output.orderId);

    // The database refuses it too, whatever the tool checked.
    const forged = await admin().rpc("create_draft_order", {
      payload: {
        workspace_id: alice.workspaceId,
        seller_id: alice.sellerId,
        channel: "whatsapp",
        customer_name: "X Y",
        customer_phone: BUYER,
        customer_city: "Lahore",
        customer_address_line: "Somewhere 123",
        subtotal_amount_minor: 100,
        total_amount_minor: 100,
        created_via: "whatsapp_ai",
        conversation_id: conversation,
        items: [
          {
            product_id: (await orderItemProduct(first.body.output.orderId)) as string,
            variant_id: variantId,
            title: "T",
            quantity: 1,
            unit_price_amount_minor: 100,
            line_total_amount_minor: 100,
          },
        ],
      },
    });
    expect(forged.error?.message).toContain("orders_one_open_ai_draft_per_conversation");
  });

  it("refuses an item that is not in stock, naming it", async () => {
    const { variantId } = await shop(alice, 1);
    const conversation = await inbound(alice, "order");
    const response = await draft(conversation, variantId, 3);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("insufficient_stock");
    expect(response.body.error.message).toContain("Lawn Kurta");
  });

  it("cannot order another shop's variant", async () => {
    await shop(alice);
    const bobs = await shop(bob);
    const conversation = await inbound(alice, "order");
    const response = await draft(conversation, bobs.variantId);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("variant_not_found");
  });

  it("validates the input", async () => {
    const { variantId } = await shop(alice);
    const conversation = await inbound(alice, "order");
    const response = await agent("createOrderDraft", conversation, {
      items: [{ variantId, quantity: 21 }],
      customer: { ...CUSTOMER, addressLine: "x" },
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid_input");
  });
});

async function orderItemProduct(orderId: string) {
  const { data } = await admin().from("order_items").select("product_id").eq("order_id", orderId).limit(1).single();
  return data?.product_id;
}

describe("getPendingOrder", () => {
  it("returns null, then the open draft, never another conversation's", async () => {
    const { variantId } = await shop(alice);
    const conversation = await inbound(alice, "order");
    expect((await agent("getPendingOrder", conversation, {})).body.output).toEqual({ order: null });

    const created = await draft(conversation, variantId);
    const pending = await agent("getPendingOrder", conversation, {});
    expect(pending.body.output.order).toEqual(created.body.output);

    // getPendingOrder is a read: still answers while a seller holds the thread.
    await admin().from("conversations").update({ state: "human_takeover" }).eq("id", conversation);
    expect((await agent("getPendingOrder", conversation, {})).status).toBe(200);

    const bobConversation = await inbound(bob, "salam");
    expect((await agent("getPendingOrder", bobConversation, {})).body.output).toEqual({ order: null });
  });
});

describe("confirmOrder: the buyer must confirm twice", () => {
  it("refuses right after create, accepts after a new buyer message, and deducts stock", async () => {
    const { variantId } = await shop(alice);
    const conversation = await inbound(alice, "haan sahi hai");
    const created = await draft(conversation, variantId, 2);
    const orderId = created.body.output.orderId;

    const tooSoon = await agent("confirmOrder", conversation, { orderId });
    expect(tooSoon.status).toBe(409);
    expect(tooSoon.body.error.code).toBe("needs_buyer_confirmation");
    expect((await orderRow(orderId))?.status).toBe("draft");
    expect(await stock(variantId)).toBe(10);

    await buyerConfirms(alice, conversation);
    const confirmed = await agent("confirmOrder", conversation, { orderId });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.output).toEqual({ status: "confirmed", orderRef: created.body.output.orderRef });

    expect(await orderRow(orderId)).toMatchObject({ status: "confirmed" });
    expect(await stock(variantId)).toBe(8);
    expect((await conversationRow(conversation))?.state).toBe("ai_active");

    // Done: confirming again, or cancelling, is a not_draft.
    expect((await agent("confirmOrder", conversation, { orderId })).body.error.code).toBe("not_draft");
    expect((await agent("cancelOrderDraft", conversation, { orderId })).body.error.code).toBe("not_draft");
  });

  it("a double-sent buyer message that landed before the AI's reply does not count", async () => {
    const { variantId } = await shop(alice);
    const conversation = await inbound(alice, "haan");
    const created = await draft(conversation, variantId);
    const orderId = created.body.output.orderId;

    // Buyer double-sends while the first turn is still running: after the draft, before any reply.
    await inbound(alice, "haan");
    const early = await agent("confirmOrder", conversation, { orderId });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("needs_buyer_confirmation");

    // A failed send was never seen by the buyer either.
    await aiReply(alice, conversation, "failed");
    await inbound(alice, "HAAN");
    expect((await agent("confirmOrder", conversation, { orderId })).body.error.code).toBe("needs_buyer_confirmation");

    // The reply that was delivered, then the buyer answers it.
    await buyerConfirms(alice, conversation);
    expect((await agent("confirmOrder", conversation, { orderId })).body.output.status).toBe("confirmed");
  });

  it("the database enforces it even if the tool did not", async () => {
    const { variantId } = await shop(alice);
    const conversation = await inbound(alice, "ok");
    const created = await draft(conversation, variantId);
    const direct = await admin().rpc("ai_confirm_order", {
      p_order_id: created.body.output.orderId,
      p_conversation_id: conversation,
      p_auto_confirm: true,
      p_handoff_reason: "x",
    });
    expect(direct.error?.message).toBe("needs_buyer_confirmation");
  });

  it("with autoConfirmOrders off, hands the conversation to the seller instead", async () => {
    const { variantId } = await shop(alice);
    await settings(alice, { auto_confirm_orders: false });
    const conversation = await inbound(alice, "ok");
    const created = await draft(conversation, variantId);
    await buyerConfirms(alice, conversation);

    const response = await agent("confirmOrder", conversation, { orderId: created.body.output.orderId });
    expect(response.body.output).toEqual({ status: "awaiting_seller", orderRef: created.body.output.orderRef });
    expect(await orderRow(created.body.output.orderId)).toMatchObject({ status: "draft" });
    expect(await stock(variantId)).toBe(10);
    expect(await conversationRow(conversation)).toEqual({
      state: "waiting_approval",
      handoff_reason: `Order ${created.body.output.orderRef} needs your approval`,
    });

    // The AI is now silent: no more write tools.
    expect((await agent("cancelOrderDraft", conversation, { orderId: created.body.output.orderId })).status).toBe(403);
  });

  it("re-checks stock when confirming", async () => {
    const { variantId } = await shop(alice, 3);
    const conversation = await inbound(alice, "ok");
    const created = await draft(conversation, variantId, 3);
    await buyerConfirms(alice, conversation);
    await admin().from("product_variants").update({ quantity_on_hand: 1 }).eq("id", variantId);

    const response = await agent("confirmOrder", conversation, { orderId: created.body.output.orderId });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("insufficient_stock");
    expect(response.body.error.message).toContain("Lawn Kurta");
    expect(await orderRow(created.body.output.orderId)).toMatchObject({ status: "draft" });
  });

  it("only touches this conversation's own AI draft", async () => {
    const aliceVariant = await shop(alice);
    await shop(bob);
    const aliceConversation = await inbound(alice, "ok");
    const bobConversation = await inbound(bob, "ok");
    const created = await draft(aliceConversation, aliceVariant.variantId);
    await inbound(bob, "HAAN");

    for (const tool of ["confirmOrder", "cancelOrderDraft"]) {
      const response = await agent(tool, bobConversation, { orderId: created.body.output.orderId });
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("not_found");
    }
    expect(await orderRow(created.body.output.orderId)).toMatchObject({ status: "draft" });

    // A manual order of the same shop is not the AI's to confirm either.
    const manual = await as(alice, "post", "/api/v1/orders").send({
      workspaceId: alice.workspaceId,
      customer: { name: "Ali Raza", phone: BUYER, city: "Lahore", addressLine: "Street 1, Block 2" },
      items: [{ productId: aliceVariant.productId, variantId: aliceVariant.variantId, quantity: 1 }],
    });
    expect(manual.status).toBe(201);
    expect(manual.body.data).toMatchObject({ createdVia: "manual", conversationId: null });
    await buyerConfirms(alice, aliceConversation);
    expect((await agent("confirmOrder", aliceConversation, { orderId: manual.body.data.id })).body.error.code).toBe(
      "not_found",
    );
  });
});

describe("cancelOrderDraft", () => {
  it("cancels the draft and frees the conversation for a new one", async () => {
    const { variantId } = await shop(alice);
    const conversation = await inbound(alice, "ok");
    const created = await draft(conversation, variantId);

    const response = await agent("cancelOrderDraft", conversation, {
      orderId: created.body.output.orderId,
      reason: "buyer wants a different size",
    });
    expect(response.body.output).toEqual({ status: "cancelled", orderRef: created.body.output.orderRef });
    expect(await orderRow(created.body.output.orderId)).toMatchObject({ status: "cancelled" });
    expect((await agent("getPendingOrder", conversation, {})).body.output).toEqual({ order: null });
    expect((await draft(conversation, variantId, 1)).status).toBe(200);
  });
});

describe("seller approval", () => {
  async function waitingOrder() {
    const variant = await shop(alice);
    await settings(alice, { auto_confirm_orders: false });
    const conversation = await inbound(alice, "ok");
    const created = await draft(conversation, variant.variantId, 2);
    await buyerConfirms(alice, conversation);
    await agent("confirmOrder", conversation, { orderId: created.body.output.orderId });
    return { ...variant, conversation, orderId: created.body.output.orderId as string, ref: created.body.output.orderRef as string };
  }

  const approval = (seller: TestSeller, conversation: string, body: Record<string, unknown>) =>
    as(seller, "post", `/api/v1/conversations/${conversation}/order-approval`).send({
      workspaceId: seller.workspaceId,
      ...body,
    });

  it("approve confirms the order, returns the thread to the AI and tells the buyer", async () => {
    const order = await waitingOrder();
    const simulator = getActiveWhatsApp()?.provider as SimulatorProvider;
    const before = simulator.sent.length;

    const response = await approval(alice, order.conversation, { orderId: order.orderId, decision: "approve" });
    expect(response.status).toBe(200);
    expect(response.body.data.order).toMatchObject({ id: order.orderId, status: "confirmed" });
    expect(response.body.data.conversation).toMatchObject({ state: "ai_active", handoffReason: null });
    expect(response.body.data.message).toMatchObject({
      sender: "system",
      direction: "outbound",
      status: "sent",
      body: `Aapka order ${order.ref} confirm ho gaya. Shukriya!`,
    });

    expect(simulator.sent.slice(before)).toEqual([
      expect.objectContaining({ to: BUYER, body: `Aapka order ${order.ref} confirm ho gaya. Shukriya!` }),
    ]);
    expect(await stock(order.variantId)).toBe(8);
    expect((await orderRow(order.orderId))?.status).toBe("confirmed");

    // Decided: a second click is a conflict.
    expect((await approval(alice, order.conversation, { orderId: order.orderId, decision: "approve" })).status).toBe(409);
  });

  it("reject cancels the draft and leaves the thread with the seller", async () => {
    const order = await waitingOrder();
    const simulator = getActiveWhatsApp()?.provider as SimulatorProvider;
    const before = simulator.sent.length;

    const response = await approval(alice, order.conversation, { orderId: order.orderId, decision: "reject" });
    expect(response.status).toBe(200);
    expect(response.body.data.order.status).toBe("cancelled");
    expect(response.body.data.conversation).toMatchObject({
      state: "human_takeover",
      handoffReason: `You rejected order ${order.ref} — let the buyer know`,
    });
    expect(response.body.data.message).toBeNull();
    expect(simulator.sent.length).toBe(before);
    expect(await stock(order.variantId)).toBe(10);
  });

  it("is a 409 unless the conversation waits and the order is its pending AI draft", async () => {
    const order = await waitingOrder();

    expect((await approval(alice, order.conversation, { orderId: randomUUID(), decision: "approve" })).status).toBe(409);

    // Another conversation of the same shop that is not waiting.
    await admin().from("conversations").update({ state: "ai_active" }).eq("id", order.conversation);
    const notWaiting = await approval(alice, order.conversation, { orderId: order.orderId, decision: "approve" });
    expect(notWaiting.status).toBe(409);
    expect((await orderRow(order.orderId))?.status).toBe("draft");
  });

  it("stays inside the seller's own shop", async () => {
    const order = await waitingOrder();
    const bobsConversation = await inbound(bob, "salam");
    await admin().from("conversations").update({ state: "waiting_approval" }).eq("id", bobsConversation);

    // Bob names Alice's order on his own conversation: not his, so a conflict.
    expect((await approval(bob, bobsConversation, { orderId: order.orderId, decision: "approve" })).status).toBe(409);
    // Bob names Alice's conversation: invisible.
    expect(
      (
        await as(bob, "post", `/api/v1/conversations/${order.conversation}/order-approval`).send({
          workspaceId: alice.workspaceId,
          orderId: order.orderId,
          decision: "approve",
        })
      ).status,
    ).toBe(404);
    expect((await orderRow(order.orderId))?.status).toBe("draft");
    expect((await approval(alice, order.conversation, { orderId: order.orderId, decision: "maybe" })).status).toBe(400);
  });
});

describe("orders: source fields", () => {
  it("lists by conversationId and exposes createdVia / conversationId", async () => {
    const { variantId } = await shop(alice);
    const conversation = await inbound(alice, "ok");
    const created = await draft(conversation, variantId);
    await as(alice, "post", "/api/v1/orders").send({
      workspaceId: alice.workspaceId,
      customer: { name: "Ali Raza", phone: "+923111111111", city: "Lahore" },
      items: [{ productId: (await orderItemProduct(created.body.output.orderId)) as string, variantId, quantity: 1 }],
    });

    const filtered = await as(alice, "get", "/api/v1/orders").query({
      workspaceId: alice.workspaceId,
      conversationId: conversation,
    });
    expect(filtered.status).toBe(200);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0]).toMatchObject({
      id: created.body.output.orderId,
      createdVia: "whatsapp_ai",
      conversationId: conversation,
      channel: "whatsapp",
    });

    const all = await as(alice, "get", "/api/v1/orders").query({ workspaceId: alice.workspaceId });
    expect(all.body.data).toHaveLength(2);
    expect(all.body.data.map((o: { createdVia: string }) => o.createdVia).sort()).toEqual(["manual", "whatsapp_ai"]);

    const detail = await as(alice, "get", `/api/v1/orders/${created.body.output.orderId}`).query({
      workspaceId: alice.workspaceId,
    });
    expect(detail.body.data).toMatchObject({ createdVia: "whatsapp_ai", conversationId: conversation });
  });

  it("keeps the order when its conversation is deleted, clearing only the link", async () => {
    const { variantId } = await shop(alice);
    const conversation = await inbound(alice, "ok");
    const created = await draft(conversation, variantId);

    const { error } = await admin().from("conversations").delete().eq("id", conversation);
    expect(error).toBeNull();
    expect(await orderRow(created.body.output.orderId)).toMatchObject({
      conversation_id: null,
      workspace_id: alice.workspaceId,
      created_via: "whatsapp_ai",
    });
  });

  it("copilot drafts are created_via copilot", async () => {
    const { variantId, productId } = await shop(alice);
    const result = await createDraftOrderTool({
      sellerId: alice.sellerId,
      db: createApiSupabaseUserClient(alice.accessToken),
    }).execute({
      customer: { name: "Ali Raza", phone: "+923111111111", city: "Lahore", addressLine: "Street 1, Block 2" },
      items: [{ variantId, productId, quantity: 1 }],
    });
    expect(result.status).toBe("success");
    expect(await orderRow((result as { orderId: string }).orderId)).toMatchObject({
      created_via: "copilot",
      conversation_id: null,
      created_by_tool_call_id: null,
    });
  });

  it("sellers cannot write the source columns through PostgREST", async () => {
    const { variantId } = await shop(alice);
    const conversation = await inbound(alice, "ok");
    const created = await draft(conversation, variantId);
    const db = createApiSupabaseUserClient(alice.accessToken);

    for (const patch of [
      { created_via: "manual" },
      { conversation_id: null },
      { created_by_tool_call_id: randomUUID() },
    ]) {
      const result = await db.from("orders").update(patch).eq("id", created.body.output.orderId).select();
      expect(result.error?.message).toMatch(/permission denied/i);
    }

    const insert = await db.from("orders").insert({
      workspace_id: alice.workspaceId,
      seller_id: alice.sellerId,
      customer_id: randomUUID(),
      customer_name: "Forged",
      customer_phone: "+923222222222",
      customer_city: "Lahore",
      subtotal_amount_minor: 0,
      total_amount_minor: 0,
      conversation_id: conversation,
    });
    expect(insert.error?.message).toMatch(/permission denied/i);

    const forgedAi = await db.from("orders").insert({
      workspace_id: alice.workspaceId,
      seller_id: alice.sellerId,
      customer_id: randomUUID(),
      customer_name: "Forged",
      customer_phone: "+923222222222",
      customer_city: "Lahore",
      subtotal_amount_minor: 0,
      total_amount_minor: 0,
      created_via: "whatsapp_ai",
    });
    expect(forgedAi.error).not.toBeNull();

    // What a seller could always do still works.
    const ok = await db.from("orders").update({ note: "gift wrap" }).eq("id", created.body.output.orderId).select();
    expect(ok.error).toBeNull();
    expect(ok.data).toHaveLength(1);
  });

  it("sales agent settings: sellers manage the new columns, nobody else", async () => {
    const db = createApiSupabaseUserClient(alice.accessToken);
    const insert = await db
      .from("sales_agent_settings")
      .insert({ workspace_id: alice.workspaceId, seller_id: alice.sellerId, auto_confirm_orders: false });
    expect(insert.error).toBeNull();
    const update = await db
      .from("sales_agent_settings")
      .update({ shipping_fee_minor: 15000 })
      .eq("workspace_id", alice.workspaceId)
      .select();
    expect(update.data?.[0]).toMatchObject({ auto_confirm_orders: false, shipping_fee_minor: 15000 });
    const negative = await db
      .from("sales_agent_settings")
      .update({ shipping_fee_minor: -1 })
      .eq("workspace_id", alice.workspaceId);
    expect(negative.error).not.toBeNull();
    // Bob cannot touch Alice's row.
    const hijack = await createApiSupabaseUserClient(bob.accessToken)
      .from("sales_agent_settings")
      .update({ shipping_fee_minor: 1 })
      .eq("workspace_id", alice.workspaceId)
      .select();
    expect(hijack.data ?? []).toEqual([]);
  });
});

describe("checkInventory", () => {
  it("gives the model the variantId it needs to order", async () => {
    const { productId, variantId } = await shop(alice);
    const conversation = await inbound(alice, "salam");
    const response = await agent("checkInventory", conversation, { productId });
    expect(response.body.output.variants[0]).toMatchObject({ variantId });
  });
});
