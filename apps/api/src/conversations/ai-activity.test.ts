import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { errorHandler } from "../middleware/error-handler.js";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const CONVERSATION = "22222222-2222-4222-8222-222222222222";

type Result = { data: unknown; error: unknown };

const calls: Array<[string, string, unknown[]]> = [];
const results: Record<string, Result> = {};

function builder(table: string) {
  const b: Record<string, unknown> = {
    then: (resolve: (value: Result) => unknown) => resolve(results[table] ?? { data: null, error: null }),
  };
  for (const method of ["select", "eq", "order", "limit", "maybeSingle"]) {
    b[method] = (...args: unknown[]) => {
      calls.push([table, method, args]);
      return b;
    };
  }
  return b;
}

vi.mock("../lib/supabase.js", () => ({
  createApiSupabaseUserClient: () => ({ from: (table: string) => builder(table) }),
  createApiSupabaseAdminClient: () => ({}),
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

const conversationRow = {
  id: CONVERSATION,
  workspace_id: WORKSPACE,
  channel: "whatsapp",
  buyer_phone: "+923001234567",
  buyer_name: null,
  customer_id: null,
  state: "human_takeover",
  handoff_reason: "buyer asked for a person",
  unread_count: 0,
  last_message_at: null,
  last_message_preview: null,
  last_message_sender: null,
  state_changed_at: "2026-11-15T09:00:00+00:00",
  created_at: "2026-11-15T09:00:00+00:00",
  updated_at: "2026-11-15T10:00:00+00:00",
};

beforeEach(() => {
  calls.length = 0;
  for (const key of Object.keys(results)) delete results[key];
});

describe("GET /conversations/:id/ai-activity", () => {
  it("returns state, handoff reason, last AI message and tool calls without input", async () => {
    results.conversations = { data: conversationRow, error: null };
    results.messages = {
      data: { body: "Yes, it is in stock.", created_at: "2026-11-15T09:30:00+00:00" },
      error: null,
    };
    results.ai_tool_calls = {
      data: [
        { tool_name: "check_stock", ok: true, error_code: null, duration_ms: 42, created_at: "2026-11-15T09:29:00+00:00" },
        { tool_name: "search_products", ok: false, error_code: "timeout", duration_ms: 900, created_at: "2026-11-15T09:28:00+00:00" },
      ],
      error: null,
    };

    const res = await request(buildApp())
      .get(`/api/v1/conversations/${CONVERSATION}/ai-activity`)
      .query({ workspaceId: WORKSPACE });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      state: "human_takeover",
      handoffReason: "buyer asked for a person",
      lastAiMessagePreview: "Yes, it is in stock.",
    });
    expect(res.body.data.recentToolCalls).toHaveLength(2);
    expect(res.body.data.recentToolCalls[1]).toMatchObject({ tool: "search_products", ok: false, errorCode: "timeout" });
    expect(JSON.stringify(res.body)).not.toContain("input");

    const toolSelect = calls.find(([t, m]) => t === "ai_tool_calls" && m === "select");
    expect(String(toolSelect![2][0])).not.toContain("input");
    expect(calls).toContainEqual(["ai_tool_calls", "limit", [10]]);
    expect(calls).toContainEqual(["ai_tool_calls", "eq", ["conversation_id", CONVERSATION]]);
  });

  it("returns nulls and no tool calls when the AI has done nothing", async () => {
    results.conversations = { data: conversationRow, error: null };

    const res = await request(buildApp())
      .get(`/api/v1/conversations/${CONVERSATION}/ai-activity`)
      .query({ workspaceId: WORKSPACE });

    expect(res.status).toBe(200);
    expect(res.body.data.lastAiMessageAt).toBeNull();
    expect(res.body.data.recentToolCalls).toEqual([]);
  });

  it("404s when RLS hides the conversation (another seller)", async () => {
    results.conversations = { data: null, error: null };

    const res = await request(buildApp())
      .get(`/api/v1/conversations/${CONVERSATION}/ai-activity`)
      .query({ workspaceId: WORKSPACE });

    expect(res.status).toBe(404);
    expect(calls.some(([t]) => t === "ai_tool_calls")).toBe(false);
  });

  it("400s without a workspaceId", async () => {
    const res = await request(buildApp()).get(`/api/v1/conversations/${CONVERSATION}/ai-activity`);
    expect(res.status).toBe(400);
  });
});
