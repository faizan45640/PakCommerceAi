/**
 * Tier 2 - WhatsApp inbox workflow (S09) end to end.
 *
 * Real Express app, real JWTs, real Postgres with RLS and the ingest RPC.
 * Conversations are created only by inbound ingestion, so every test starts by
 * posting to the mock inbound endpoint. The customer link is arranged by
 * placing an order through the orders API (a database trigger links it).
 *
 * Requires the local Supabase stack: `npx supabase start`.
 */

import { randomUUID } from "node:crypto";

import { createSupabaseAdminClient } from "@pakcommerce/integrations/supabase";
import { conversationSchema, messageSchema } from "@pakcommerce/shared/conversations";
import request from "supertest";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { createApiSupabaseUserClient } from "../lib/supabase.js";
import type { TestSeller } from "../testing/api-test-env.js";
import {
  applyTestEnv,
  createTestSeller,
  createTestVariant,
  deleteTestSeller,
  LOCAL_ANON_KEY,
  LOCAL_SERVICE_ROLE_KEY,
  LOCAL_SUPABASE_URL,
} from "../testing/api-test-env.js";
import { transitionConversationState } from "./conversation-service.js";

const app = () => createApp();
const CONVERSATIONS = "/api/v1/conversations";

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

interface InboundOptions {
  from?: string;
  name?: string;
  body?: string;
  sid?: string;
  aiEnabled?: boolean;
}

function inbound(
  seller: TestSeller,
  options: InboundOptions = {},
  workspaceId = seller.workspaceId,
) {
  return as(seller, "post", `${CONVERSATIONS}/mock-inbound`).send({
    workspaceId,
    From: `whatsapp:${options.from ?? "+923001234567"}`,
    ProfileName: options.name ?? "Ayesha Khan",
    Body: options.body ?? "Salam, is this available?",
    MessageSid: options.sid ?? `SM${randomUUID().replace(/-/g, "")}`,
    aiEnabled: options.aiEnabled ?? false,
  });
}

async function receive(seller: TestSeller, options: InboundOptions = {}) {
  const response = await inbound(seller, options);
  expect([200, 201]).toContain(response.status);
  return response.body.data as {
    conversationId: string;
    messageId: string;
    duplicate: boolean;
    state: string;
  };
}

function list(seller: TestSeller, query: Record<string, unknown> = {}) {
  return as(seller, "get", CONVERSATIONS).query({ workspaceId: seller.workspaceId, ...query });
}

function detail(seller: TestSeller, id: string) {
  return as(seller, "get", `${CONVERSATIONS}/${id}`).query({ workspaceId: seller.workspaceId });
}

function markRead(seller: TestSeller, id: string) {
  return as(seller, "post", `${CONVERSATIONS}/${id}/read`).query({
    workspaceId: seller.workspaceId,
  });
}

function move(seller: TestSeller, id: string, to: string, reason?: string) {
  return as(seller, "post", `${CONVERSATIONS}/${id}/state`).send({
    workspaceId: seller.workspaceId,
    to,
    ...(reason ? { reason } : {}),
  });
}

describe("authentication", () => {
  it("rejects every endpoint with no token", async () => {
    const id = randomUUID();
    const workspaceId = alice.workspaceId;

    expect((await request(app()).get(CONVERSATIONS).query({ workspaceId })).status).toBe(401);
    expect((await request(app()).get(`${CONVERSATIONS}/${id}`).query({ workspaceId })).status).toBe(
      401,
    );
    expect(
      (await request(app()).post(`${CONVERSATIONS}/mock-inbound`).send({ workspaceId })).status,
    ).toBe(401);
  });
});

describe("mock inbound", () => {
  it("starts an open thread when AI is off", async () => {
    const result = await receive(alice, { aiEnabled: false });

    expect(result.duplicate).toBe(false);
    expect(result.state).toBe("open");
    expect((await detail(alice, result.conversationId)).body.data.state).toBe("open");
  });

  it("starts an ai_active thread when AI is on", async () => {
    const result = await receive(alice, { aiEnabled: true });

    expect(result.state).toBe("ai_active");
  });

  it("answers 201 for a new message and 200 for a duplicate", async () => {
    const first = await inbound(alice, { sid: "SMdup1" });
    const second = await inbound(alice, { sid: "SMdup1" });

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
  });

  it("rejects a malformed body with 400", async () => {
    const response = await as(alice, "post", `${CONVERSATIONS}/mock-inbound`).send({
      workspaceId: alice.workspaceId,
    });

    expect(response.status).toBe(400);
  });
});

describe("inbox refresh", () => {
  it("lists the thread with preview, sender and unread count", async () => {
    const { conversationId } = await receive(alice, {
      name: "Ayesha Khan",
      body: "Do you have this in blue?",
    });

    const response = await list(alice);

    expect(response.status).toBe(200);
    expect(response.body.meta).toMatchObject({ page: 1, total: 1 });
    const [item] = response.body.data;
    expect(conversationSchema.safeParse(item).success).toBe(true);
    expect(item).toMatchObject({
      id: conversationId,
      buyerName: "Ayesha Khan",
      buyerPhone: "+923001234567",
      lastMessagePreview: "Do you have this in blue?",
      lastMessageSender: "buyer",
      unreadCount: 1,
      state: "open",
    });
  });

  it("bumps unread and moves the newest thread to the top", async () => {
    const a = await receive(alice, { from: "+923001111111", name: "Ayesha" });
    const b = await receive(alice, { from: "+923002222222", name: "Bilal" });

    let ids = (await list(alice)).body.data.map((c: { id: string }) => c.id);
    expect(ids).toEqual([b.conversationId, a.conversationId]);

    const again = await receive(alice, { from: "+923001111111", body: "Hello again" });
    expect(again.conversationId).toBe(a.conversationId);

    const response = await list(alice);
    ids = response.body.data.map((c: { id: string }) => c.id);
    expect(ids).toEqual([a.conversationId, b.conversationId]);
    expect(response.body.data[0]).toMatchObject({
      unreadCount: 2,
      lastMessagePreview: "Hello again",
    });
    expect(response.body.data[1].unreadCount).toBe(1);
  });

  it("ignores a duplicate MessageSid", async () => {
    const first = await receive(alice, { sid: "SMsame" });
    const second = await receive(alice, { sid: "SMsame", body: "different text" });

    expect(second.duplicate).toBe(true);
    expect(second.conversationId).toBe(first.conversationId);
    expect(second.messageId).toBe(first.messageId);

    const [item] = (await list(alice)).body.data;
    expect(item.unreadCount).toBe(1);
    const messages = await as(alice, "get", `${CONVERSATIONS}/${first.conversationId}/messages`)
      .query({ workspaceId: alice.workspaceId });
    expect(messages.body.data).toHaveLength(1);
  });

  it("searches by name and by phone in any format", async () => {
    await receive(alice, { from: "+923001111111", name: "Ayesha Khan" });
    await receive(alice, { from: "+923452222222", name: "Bilal Ahmed" });

    const names = async (query: string) =>
      (await list(alice, { query })).body.data.map((c: { buyerName: string }) => c.buyerName);

    expect(await names("bilal")).toEqual(["Bilal Ahmed"]);
    expect(await names("AYESHA")).toEqual(["Ayesha Khan"]);
    expect(await names("+923452222222")).toEqual(["Bilal Ahmed"]);
    expect(await names("0345-2222222")).toEqual(["Bilal Ahmed"]);
    expect(await names("nobody")).toEqual([]);
  });

  it("filters by states and unreadOnly", async () => {
    const open = await receive(alice, { from: "+923001111111", name: "Open One" });
    const ai = await receive(alice, { from: "+923002222222", name: "AI One", aiEnabled: true });
    const closed = await receive(alice, { from: "+923003333333", name: "Closed One" });
    expect((await move(alice, closed.conversationId, "closed")).status).toBe(200);
    expect((await markRead(alice, open.conversationId)).status).toBe(200);

    const idsOf = async (query: Record<string, unknown>) =>
      (await list(alice, query)).body.data.map((c: { id: string }) => c.id).sort();

    expect(await idsOf({ states: "ai_active" })).toEqual([ai.conversationId]);
    expect(await idsOf({ states: "open,closed" })).toEqual(
      [open.conversationId, closed.conversationId].sort(),
    );
    expect(await idsOf({ unreadOnly: "true" })).toEqual(
      [ai.conversationId, closed.conversationId].sort(),
    );
    expect(await idsOf({ unreadOnly: "true", states: "ai_active" })).toEqual([ai.conversationId]);
  });

  it("pages with the cursor without losing or repeating rows", async () => {
    const created: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const result = await receive(alice, {
        from: `+92300000000${index}`,
        name: `Buyer ${index}`,
      });
      created.push(result.conversationId);
    }

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const response = await list(alice, { limit: 2, ...(cursor ? { cursor } : {}) });
      expect(response.status).toBe(200);
      expect(response.body.meta.total).toBe(5);
      seen.push(...response.body.data.map((c: { id: string }) => c.id));
      cursor = response.body.nextCursor ?? undefined;
      pages += 1;
    } while (cursor && pages < 10);

    expect(pages).toBe(3);
    expect(seen).toEqual([...created].reverse());
  });
});

describe("conversation detail", () => {
  it("returns the thread, its messages newest first, and pages them", async () => {
    const first = await receive(alice, { body: "one" });
    await receive(alice, { body: "two" });
    await receive(alice, { body: "three" });

    const thread = await detail(alice, first.conversationId);
    expect(thread.status).toBe(200);
    expect(conversationSchema.safeParse(thread.body.data).success).toBe(true);
    expect(thread.body.data.unreadCount).toBe(3);

    const messagesUrl = `${CONVERSATIONS}/${first.conversationId}/messages`;
    const query = { workspaceId: alice.workspaceId };

    const page1 = await as(alice, "get", messagesUrl).query({ ...query, limit: 2 });
    expect(page1.status).toBe(200);
    expect(page1.body.meta.total).toBe(3);
    expect(page1.body.data.map((m: { body: string }) => m.body)).toEqual(["three", "two"]);
    expect(page1.body.nextCursor).toBeTruthy();
    for (const message of page1.body.data) {
      expect(messageSchema.safeParse(message).success).toBe(true);
      expect(message).toMatchObject({ direction: "inbound", sender: "buyer" });
    }

    const page2 = await as(alice, "get", messagesUrl).query({
      ...query,
      limit: 2,
      cursor: page1.body.nextCursor,
    });
    expect(page2.body.data.map((m: { body: string }) => m.body)).toEqual(["one"]);
    expect(page2.body.nextCursor).toBeNull();
  });

  it("zeroes unread on read and keeps it zero in the list", async () => {
    const { conversationId } = await receive(alice);
    await receive(alice);

    const read = await markRead(alice, conversationId);

    expect(read.status).toBe(200);
    expect(read.body.data.unreadCount).toBe(0);
    expect((await list(alice, { unreadOnly: "true" })).body.data).toEqual([]);
    expect((await detail(alice, conversationId)).body.data.unreadCount).toBe(0);

    // A new inbound after reading raises it again.
    await receive(alice);
    expect((await detail(alice, conversationId)).body.data.unreadCount).toBe(1);
  });

  it("answers 404 for an unknown id and 400 for a malformed one", async () => {
    expect((await detail(alice, randomUUID())).status).toBe(404);
    expect((await detail(alice, "not-a-uuid")).status).toBe(400);
  });
});

describe("customer link", () => {
  it("links the conversation once an order exists for the same phone", async () => {
    const { conversationId } = await receive(alice, { from: "+923001234567" });

    const before = await detail(alice, conversationId);
    expect(before.body.data.customerId).toBeNull();

    const { productId, variantId } = await createTestVariant(alice, { quantity: 10 });
    const order = await as(alice, "post", "/api/v1/orders").send({
      workspaceId: alice.workspaceId,
      customer: {
        name: "Ayesha Khan",
        phone: "0300-1234567",
        city: "Lahore",
        addressLine: "House 4, Gulberg",
      },
      items: [{ productId, variantId, quantity: 1 }],
    });
    expect(order.status).toBe(201);
    const customerId = order.body.data.customerId as string;
    expect(customerId).toBeTruthy();

    const after = await detail(alice, conversationId);
    expect(after.body.data.customerId).toBe(customerId);
    expect((await list(alice)).body.data[0].customerId).toBe(customerId);

    const context = await as(alice, "get", "/api/v1/customers/context").query({
      workspaceId: alice.workspaceId,
      phone: after.body.data.buyerPhone,
    });
    expect(context.status).toBe(200);
    expect(JSON.stringify(context.body.data)).toContain(customerId);
  });

  it("links a conversation that starts after the customer already exists", async () => {
    const { productId, variantId } = await createTestVariant(alice, { quantity: 10 });
    const order = await as(alice, "post", "/api/v1/orders").send({
      workspaceId: alice.workspaceId,
      customer: { name: "Sana Malik", phone: "03451112222", city: "Karachi" },
      items: [{ productId, variantId, quantity: 1 }],
    });
    expect(order.status).toBe(201);

    const { conversationId } = await receive(alice, { from: "+923451112222", name: "Sana" });

    expect((await detail(alice, conversationId)).body.data.customerId).toBe(
      order.body.data.customerId,
    );
  });
});

describe("AI toggle and takeover", () => {
  it("walks the seller moves", async () => {
    const { conversationId: id } = await receive(alice, { aiEnabled: true });

    const takeover = await move(alice, id, "human_takeover", "Buyer wants a discount");
    expect(takeover.status).toBe(200);
    expect(takeover.body.data).toMatchObject({
      state: "human_takeover",
      handoffReason: "Buyer wants a discount",
    });

    const handBack = await move(alice, id, "ai_active");
    expect(handBack.status).toBe(200);
    expect(handBack.body.data).toMatchObject({ state: "ai_active", handoffReason: null });

    const aiOff = await move(alice, id, "open");
    expect(aiOff.status).toBe(200);
    expect(aiOff.body.data.state).toBe("open");

    const closed = await move(alice, id, "closed");
    expect(closed.status).toBe(200);
    expect(closed.body.data.state).toBe("closed");

    // Persisted, not just echoed.
    expect((await detail(alice, id)).body.data.state).toBe("closed");
  });

  it("lets a buyer message reopen a closed thread according to aiEnabled", async () => {
    const off = await receive(alice, { from: "+923001111111" });
    await move(alice, off.conversationId, "closed");
    const reopenedOff = await receive(alice, { from: "+923001111111", aiEnabled: false });
    expect(reopenedOff.conversationId).toBe(off.conversationId);
    expect(reopenedOff.state).toBe("open");

    const on = await receive(alice, { from: "+923002222222" });
    await move(alice, on.conversationId, "closed");
    const reopenedOn = await receive(alice, { from: "+923002222222", aiEnabled: true });
    expect(reopenedOn.conversationId).toBe(on.conversationId);
    expect(reopenedOn.state).toBe("ai_active");
    expect((await detail(alice, on.conversationId)).body.data.state).toBe("ai_active");
  });

  it("keeps a human takeover when a buyer writes again", async () => {
    const { conversationId } = await receive(alice, { aiEnabled: true });
    await move(alice, conversationId, "human_takeover", "Custom request");

    const next = await receive(alice, { aiEnabled: true, body: "Are you there?" });

    expect(next.state).toBe("human_takeover");
    expect((await detail(alice, conversationId)).body.data.handoffReason).toBe("Custom request");
  });

  it("answers 409 for an illegal move and leaves the state alone", async () => {
    const { conversationId } = await receive(alice);

    // open -> waiting_approval is the AI's move, never the seller's.
    expect((await move(alice, conversationId, "waiting_approval")).status).toBe(409);

    await move(alice, conversationId, "closed");
    // closed -> human_takeover has no edge.
    expect((await move(alice, conversationId, "human_takeover")).status).toBe(409);
    // closed -> closed is not a move either.
    expect((await move(alice, conversationId, "closed")).status).toBe(409);

    expect((await detail(alice, conversationId)).body.data.state).toBe("closed");
  });

  it("rejects an unknown state with 400", async () => {
    const { conversationId } = await receive(alice);

    expect((await move(alice, conversationId, "banana")).status).toBe(400);
  });

  it("answers 409 when the thread moved between the read and the write", async () => {
    const { conversationId } = await receive(alice, { aiEnabled: true });
    const admin = createSupabaseAdminClient({
      url: LOCAL_SUPABASE_URL,
      anonKey: LOCAL_ANON_KEY,
      serviceRoleKey: LOCAL_SERVICE_ROLE_KEY,
    });
    const real = createApiSupabaseUserClient(alice.accessToken);

    // Another tab closes the thread right after this request has read it.
    let raced = false;
    const racing = new Proxy(real, {
      get(target, property, receiver) {
        if (property !== "from") return Reflect.get(target, property, receiver);
        return (table: string) => {
          const builder = target.from(table as never) as unknown as Record<string, unknown>;
          if (table !== "conversations" || raced) return builder;
          return new Proxy(builder, {
            get(inner, key) {
              const value = inner[key as string];
              if (key !== "select" || typeof value !== "function") return value;
              return (...args: unknown[]) => {
                const query = (
                  value as (...a: unknown[]) => PromiseLike<unknown> & {
                    maybeSingle: () => PromiseLike<unknown>;
                  }
                ).apply(inner, args);
                const maybeSingle = query.maybeSingle.bind(query);
                query.maybeSingle = () =>
                  maybeSingle().then(async (result) => {
                    raced = true;
                    await admin
                      .from("conversations")
                      .update({ state: "closed" })
                      .eq("id", conversationId);
                    return result;
                  });
                return query;
              };
            },
          });
        };
      },
    });

    await expect(
      transitionConversationState({ sellerId: alice.sellerId, db: racing }, conversationId, {
        workspaceId: alice.workspaceId,
        to: "human_takeover",
        reason: "stale",
      }),
    ).rejects.toMatchObject({ status: 409 });

    expect(raced).toBe(true);
    expect((await detail(alice, conversationId)).body.data.state).toBe("closed");
  });
});

describe("isolation between sellers", () => {
  it("answers 404 on every conversation endpoint for another seller's thread", async () => {
    const { conversationId: id } = await receive(alice, { aiEnabled: true });
    const query = { workspaceId: alice.workspaceId };

    expect((await as(bob, "get", `${CONVERSATIONS}/${id}`).query(query)).status).toBe(404);
    expect((await as(bob, "get", `${CONVERSATIONS}/${id}/messages`).query(query)).status).toBe(
      404,
    );
    expect((await as(bob, "post", `${CONVERSATIONS}/${id}/read`).query(query)).status).toBe(404);
    expect(
      (
        await as(bob, "post", `${CONVERSATIONS}/${id}/state`).send({
          ...query,
          to: "human_takeover",
          reason: "hijack",
        })
      ).status,
    ).toBe(404);

    // Alice's thread is untouched.
    const after = (await detail(alice, id)).body.data;
    expect(after).toMatchObject({ state: "ai_active", unreadCount: 1, handoffReason: null });
  });

  it("shows bob nothing of alice's inbox, even when asking for her workspace", async () => {
    await receive(alice);

    expect((await list(bob)).body.data).toEqual([]);

    const foreign = await as(bob, "get", CONVERSATIONS).query({ workspaceId: alice.workspaceId });
    expect(foreign.status).toBe(200);
    expect(foreign.body.data).toEqual([]);
    expect(foreign.body.meta.total).toBe(0);
  });

  it("refuses mock inbound into another seller's workspace and creates nothing", async () => {
    const response = await inbound(bob, { aiEnabled: true }, alice.workspaceId);

    expect(response.status).toBe(404);
    expect((await list(alice)).body.data).toEqual([]);
    expect((await list(bob)).body.data).toEqual([]);
  });
});
