import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { errorHandler } from "../middleware/error-handler.js";

/**
 * POST /conversations/:id/state with a fake client. The service reads the row,
 * checks the seller-actor rules, then runs a conditional update, so the fake
 * serves queued results: first the read, then the update.
 */

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const CONVERSATION = "22222222-2222-4222-8222-222222222222";

type Result = { data: unknown; error: unknown };

const queue: Result[] = [];
const calls: Array<[string, unknown[]]> = [];

function builder(result: Result) {
  const b: Record<string, unknown> = { then: (resolve: (value: Result) => unknown) => resolve(result) };
  for (const method of ["select", "eq", "update", "maybeSingle"]) {
    b[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return b;
    };
  }
  return b;
}

vi.mock("../lib/supabase.js", () => ({
  createApiSupabaseUserClient: () => ({
    from: () => builder(queue.shift() ?? { data: null, error: null }),
  }),
  createApiSupabaseAdminClient: () => {
    throw new Error("state changes must not use the admin client");
  },
}));

const { conversationRouter } = await import("./conversation-router.js");

function row(state: string, overrides: Record<string, unknown> = {}) {
  return {
    id: CONVERSATION,
    workspace_id: WORKSPACE,
    seller_id: "seller-1",
    channel: "whatsapp",
    buyer_phone: "+923001234567",
    buyer_name: "Ayesha",
    customer_id: null,
    state,
    handoff_reason: null,
    unread_count: 0,
    last_message_at: null,
    last_message_preview: null,
    last_message_sender: null,
    state_changed_at: "2026-11-15T09:00:00+00:00",
    created_at: "2026-11-15T09:00:00+00:00",
    updated_at: "2026-11-15T09:00:00+00:00",
    ...overrides,
  };
}

function send(body: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = { userId: "seller-1", accessToken: "token" } as typeof req.auth;
    next();
  });
  app.use("/api/v1/conversations", conversationRouter);
  app.use(errorHandler);

  return request(app)
    .post(`/api/v1/conversations/${CONVERSATION}/state`)
    .send({ workspaceId: WORKSPACE, ...body });
}

const updates = () => calls.filter(([name]) => name === "update").map(([, args]) => args[0]);

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

describe("POST /conversations/:id/state", () => {
  it("takes over, stores the trimmed reason and guards on the state it read", async () => {
    queue.push(
      { data: row("ai_active"), error: null },
      { data: row("human_takeover", { handoff_reason: "VIP buyer" }), error: null },
    );

    const res = await send({ to: "human_takeover", reason: "  VIP buyer " });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ state: "human_takeover", handoffReason: "VIP buyer" });
    expect(updates()).toEqual([{ state: "human_takeover", handoff_reason: "VIP buyer" }]);
    expect(calls).toContainEqual(["eq", ["state", "ai_active"]]);
  });

  it("does not store a reason for other targets", async () => {
    queue.push({ data: row("human_takeover"), error: null }, { data: row("ai_active"), error: null });

    const res = await send({ to: "ai_active", reason: "ignored" });

    expect(res.status).toBe(200);
    expect(updates()).toEqual([{ state: "ai_active", handoff_reason: null }]);
  });

  it("is 409 for a move a seller may not make, without updating", async () => {
    queue.push({ data: row("closed"), error: null });

    const res = await send({ to: "human_takeover" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("conflict");
    expect(res.body.error.message).toContain("closed");
    expect(updates()).toEqual([]);
  });

  it("is 409 for a no-op move to the same state", async () => {
    queue.push({ data: row("open"), error: null });
    expect((await send({ to: "open" })).status).toBe(409);
  });

  it("is 409 when another tab changed the state first (no row matched)", async () => {
    queue.push({ data: row("ai_active"), error: null }, { data: null, error: null });

    const res = await send({ to: "closed" });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/updated elsewhere/);
  });

  it("is 409 when the database trigger refuses the edge", async () => {
    queue.push(
      { data: row("ai_active"), error: null },
      { data: null, error: { code: "23514", message: "illegal conversation transition" } },
    );
    expect((await send({ to: "closed" })).status).toBe(409);
  });

  it("is 404 for a conversation the seller cannot see", async () => {
    queue.push({ data: null, error: null });
    expect((await send({ to: "closed" })).status).toBe(404);
  });

  it("validates the body", async () => {
    expect((await send({ to: "nope" })).status).toBe(400);
    expect((await send({ to: "closed", reason: "x".repeat(501) })).status).toBe(400);
    expect((await send({ to: "closed", workspaceId: "bad" })).status).toBe(400);
  });
});
