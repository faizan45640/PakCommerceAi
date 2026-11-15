import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { errorHandler } from "../middleware/error-handler.js";

/**
 * Router tests with a fake Supabase client: no database. They pin the HTTP
 * contract, the query the service builds, and the ordering of the ownership
 * check before the admin-client RPC.
 */

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const CONVERSATION = "22222222-2222-4222-8222-222222222222";
const MESSAGE = "33333333-3333-4333-8333-333333333333";

type Result = { data: unknown; error: unknown; count?: number | null };

/** Chainable stand-in for a PostgREST builder; records every call. */
function fakeBuilder(result: Result, calls: Array<[string, unknown[]]>) {
  const builder: Record<string, unknown> = {
    then: (resolve: (value: Result) => unknown) => resolve(result),
  };
  for (const method of [
    "select",
    "eq",
    "in",
    "gt",
    "or",
    "order",
    "range",
    "update",
    "maybeSingle",
  ]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  return builder;
}

const userCalls: Array<[string, unknown[]]> = [];
const userResults: Record<string, Result> = {};
const rpc = vi.fn();

vi.mock("../lib/supabase.js", () => ({
  createApiSupabaseUserClient: () => ({
    from: (table: string) => {
      userCalls.push(["from", [table]]);
      return fakeBuilder(userResults[table] ?? { data: null, error: null }, userCalls);
    },
  }),
  createApiSupabaseAdminClient: () => ({ rpc }),
}));

const { conversationRouter } = await import("./conversation-router.js");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = { userId: "seller-1", accessToken: "token" } as typeof req.auth;
    next();
  });
  app.use("/api/v1/conversations", conversationRouter);
  app.use(errorHandler);
  return app;
}

function conversationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CONVERSATION,
    workspace_id: WORKSPACE,
    seller_id: "seller-1",
    channel: "whatsapp",
    buyer_phone: "+923001234567",
    buyer_name: "Ayesha",
    customer_id: null,
    state: "open",
    handoff_reason: null,
    unread_count: 2,
    last_message_at: "2026-11-15T10:00:00.123456+00:00",
    last_message_preview: "Salam",
    last_message_sender: "buyer",
    state_changed_at: "2026-11-15T09:00:00+00:00",
    created_at: "2026-11-15T09:00:00+00:00",
    updated_at: "2026-11-15T10:00:00+00:00",
    ...overrides,
  };
}

const callsOf = (method: string) => userCalls.filter(([name]) => name === method).map(([, a]) => a);

const originalEnv = { ...process.env };

beforeEach(() => {
  userCalls.length = 0;
  for (const key of Object.keys(userResults)) delete userResults[key];
  rpc.mockReset();
  process.env.NODE_ENV = "test";
  delete process.env.ENABLE_MOCK_INBOUND;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("GET /conversations", () => {
  it("decodes states and unreadOnly, filters, orders, and returns the envelope", async () => {
    userResults.conversations = { data: [conversationRow()], error: null, count: 1 };

    const res = await request(buildApp()).get("/api/v1/conversations").query({
      workspaceId: WORKSPACE,
      states: "open, ai_active",
      unreadOnly: "true",
      query: "0300-123",
      limit: "10",
    });

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ id: CONVERSATION, unreadCount: 2, state: "open" });
    expect(res.body.meta).toEqual({ page: 1, pageSize: 10, total: 1 });
    expect(res.body.nextCursor).toBeNull();

    expect(callsOf("in")).toEqual([["state", ["open", "ai_active"]]]);
    expect(callsOf("gt")).toEqual([["unread_count", 0]]);
    expect(callsOf("or")[0]![0]).toContain('buyer_phone.ilike."%+92300123%"');
    expect(callsOf("order")).toEqual([
      ["last_message_at", { ascending: false, nullsFirst: false }],
      ["id", { ascending: false }],
    ]);
  });

  it("treats unreadOnly=false as off and rejects an unknown state", async () => {
    userResults.conversations = { data: [], error: null, count: 0 };

    const off = await request(buildApp())
      .get("/api/v1/conversations")
      .query({ workspaceId: WORKSPACE, unreadOnly: "false" });
    expect(off.status).toBe(200);
    expect(callsOf("gt")).toEqual([]);

    const bad = await request(buildApp())
      .get("/api/v1/conversations")
      .query({ workspaceId: WORKSPACE, states: "open,bogus" });
    expect(bad.status).toBe(400);
  });

  it("escapes the search term so it cannot rewrite the filter", async () => {
    userResults.conversations = { data: [], error: null, count: 0 };

    await request(buildApp())
      .get("/api/v1/conversations")
      .query({ workspaceId: WORKSPACE, query: '50%",x' });

    expect(callsOf("or")[0]![0]).toContain('buyer_name.ilike."%50\\\\%\\",x%"');
  });

  it("paginates with a stable cursor and offsets the next page", async () => {
    userResults.conversations = { data: [conversationRow()], error: null, count: 3 };

    const first = await request(buildApp())
      .get("/api/v1/conversations")
      .query({ workspaceId: WORKSPACE, limit: "1" });
    expect(first.body.nextCursor).toEqual(expect.any(String));
    expect(callsOf("range")).toEqual([[0, 0]]);

    userCalls.length = 0;
    const second = await request(buildApp())
      .get("/api/v1/conversations")
      .query({ workspaceId: WORKSPACE, limit: "1", cursor: first.body.nextCursor });
    expect(second.body.meta.page).toBe(2);
    expect(callsOf("range")).toEqual([[1, 1]]);
    // Same ordering on every page, id as the tiebreaker.
    expect(callsOf("order")[1]).toEqual(["id", { ascending: false }]);
  });

  it("rejects a garbage cursor", async () => {
    const res = await request(buildApp())
      .get("/api/v1/conversations")
      .query({ workspaceId: WORKSPACE, cursor: "nope" });
    expect(res.status).toBe(400);
  });
});

describe("GET /conversations/:id", () => {
  it("returns the conversation", async () => {
    userResults.conversations = { data: conversationRow(), error: null };
    const res = await request(buildApp()).get(`/api/v1/conversations/${CONVERSATION}`).query({ workspaceId: WORKSPACE });
    expect(res.status).toBe(200);
    expect(res.body.data.buyerPhone).toBe("+923001234567");
  });

  it("is 404 when RLS hides it, 400 for a bad id", async () => {
    userResults.conversations = { data: null, error: null };
    const missing = await request(buildApp()).get(`/api/v1/conversations/${CONVERSATION}`).query({ workspaceId: WORKSPACE });
    expect(missing.status).toBe(404);

    const bad = await request(buildApp()).get("/api/v1/conversations/not-a-uuid").query({ workspaceId: WORKSPACE });
    expect(bad.status).toBe(400);
  });
});

describe("GET /conversations/:id/messages", () => {
  it("returns newest first with a next cursor", async () => {
    userResults.conversations = { data: conversationRow(), error: null };
    userResults.messages = {
      data: [
        {
          id: MESSAGE,
          conversation_id: CONVERSATION,
          direction: "inbound",
          sender: "buyer",
          body: "Salam",
          media: [{ url: "https://example.com/a.jpg", contentType: "image/jpeg" }],
          status: "received",
          created_at: "2026-11-15T10:00:00+00:00",
        },
      ],
      error: null,
      count: 5,
    };

    const res = await request(buildApp())
      .get(`/api/v1/conversations/${CONVERSATION}/messages`)
      .query({ workspaceId: WORKSPACE, limit: "1" });

    expect(res.status).toBe(200);
    expect(res.body.data[0].media).toHaveLength(1);
    expect(res.body.nextCursor).toEqual(expect.any(String));
    expect(callsOf("order")).toContainEqual(["created_at", { ascending: false }]);
  });

  it("is 404 for an unknown thread", async () => {
    userResults.conversations = { data: null, error: null };
    const res = await request(buildApp())
      .get(`/api/v1/conversations/${CONVERSATION}/messages`)
      .query({ workspaceId: WORKSPACE });
    expect(res.status).toBe(404);
  });
});

describe("POST /conversations/:id/read", () => {
  it("zeroes unread_count and returns the conversation", async () => {
    userResults.conversations = { data: conversationRow({ unread_count: 0 }), error: null };
    const res = await request(buildApp())
      .post(`/api/v1/conversations/${CONVERSATION}/read`)
      .query({ workspaceId: WORKSPACE });
    expect(res.status).toBe(200);
    expect(res.body.data.unreadCount).toBe(0);
    expect(callsOf("update")).toEqual([[{ unread_count: 0 }]]);
  });

  it("is 404 when nothing matched", async () => {
    userResults.conversations = { data: null, error: null };
    const res = await request(buildApp())
      .post(`/api/v1/conversations/${CONVERSATION}/read`)
      .query({ workspaceId: WORKSPACE });
    expect(res.status).toBe(404);
  });
});

describe("POST /conversations/mock-inbound", () => {
  const payload = {
    workspaceId: WORKSPACE,
    From: "whatsapp:+923001234567",
    ProfileName: "Ayesha",
    Body: "Salam",
    MessageSid: "SM123",
  };

  it("is 404 when the flag is off, even in test", async () => {
    process.env.ENABLE_MOCK_INBOUND = "false";
    const res = await request(buildApp()).post("/api/v1/conversations/mock-inbound").send(payload);
    expect(res.status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("is 404 in production unless explicitly enabled", async () => {
    process.env.NODE_ENV = "production";
    const off = await request(buildApp()).post("/api/v1/conversations/mock-inbound").send(payload);
    expect(off.status).toBe(404);

    process.env.ENABLE_MOCK_INBOUND = "true";
    userResults.workspaces = { data: { id: WORKSPACE }, error: null };
    rpc.mockResolvedValue({
      data: [{ conversation_id: CONVERSATION, message_id: MESSAGE, duplicate: false, state: "open" }],
      error: null,
    });
    const on = await request(buildApp()).post("/api/v1/conversations/mock-inbound").send(payload);
    expect(on.status).toBe(201);
  });

  it("refuses another seller's workspace and never calls the RPC", async () => {
    userResults.workspaces = { data: null, error: null };
    const res = await request(buildApp()).post("/api/v1/conversations/mock-inbound").send(payload);
    expect(res.status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("strips whatsapp:, maps Twilio fields and calls the RPC once", async () => {
    userResults.workspaces = { data: { id: WORKSPACE }, error: null };
    rpc.mockResolvedValue({
      data: [{ conversation_id: CONVERSATION, message_id: MESSAGE, duplicate: false, state: "ai_active" }],
      error: null,
    });

    const res = await request(buildApp())
      .post("/api/v1/conversations/mock-inbound")
      .send({
        ...payload,
        NumMedia: "1",
        MediaUrl0: "https://example.com/a.jpg",
        MediaContentType0: "image/jpeg",
        aiEnabled: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      conversationId: CONVERSATION,
      messageId: MESSAGE,
      duplicate: false,
      state: "ai_active",
    });
    expect(rpc).toHaveBeenCalledWith("ingest_inbound_message", {
      p_workspace_id: WORKSPACE,
      p_buyer_phone: "+923001234567",
      p_buyer_name: "Ayesha",
      p_provider_message_id: "SM123",
      p_body: "Salam",
      p_media: [{ url: "https://example.com/a.jpg", contentType: "image/jpeg" }],
      p_ai_enabled: true,
    });
  });

  it("generates an SMmock id when MessageSid is absent", async () => {
    userResults.workspaces = { data: { id: WORKSPACE }, error: null };
    rpc.mockResolvedValue({
      data: [{ conversation_id: CONVERSATION, message_id: MESSAGE, duplicate: false, state: "open" }],
      error: null,
    });
    const { MessageSid: _omit, ...withoutSid } = payload;
    await request(buildApp()).post("/api/v1/conversations/mock-inbound").send(withoutSid);
    expect(rpc.mock.calls[0]![1].p_provider_message_id).toMatch(/^SMmock[0-9a-f]{32}$/);
  });

  it("reports a duplicate MessageSid with 200 and duplicate: true", async () => {
    userResults.workspaces = { data: { id: WORKSPACE }, error: null };
    rpc.mockResolvedValue({
      data: [{ conversation_id: CONVERSATION, message_id: MESSAGE, duplicate: true, state: "open" }],
      error: null,
    });
    const res = await request(buildApp()).post("/api/v1/conversations/mock-inbound").send(payload);
    expect(res.status).toBe(200);
    expect(res.body.data.duplicate).toBe(true);
  });

  it.each([
    ["http media url", { NumMedia: 1, MediaUrl0: "http://example.com/a.jpg", MediaContentType0: "image/jpeg" }],
    ["too many media", { NumMedia: 11 }],
    ["empty message", { Body: "" }],
    ["non-phone sender", { From: "whatsapp:abc" }],
    ["oversized body", { Body: "x".repeat(4097) }],
  ])("rejects %s with 400 before touching the database", async (_name, patch) => {
    const res = await request(buildApp())
      .post("/api/v1/conversations/mock-inbound")
      .send({ ...payload, ...patch });
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
