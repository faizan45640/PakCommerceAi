import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  createToolRegistry,
  ToolError,
  type ToolAuditEntry,
  type ToolContext,
  type ToolDefinition,
} from "../tools/registry.js";
import { createAgentRouter } from "./agent-router.js";

const TOKEN = "test-agent-token";
const CONVERSATION = "11111111-1111-4111-8111-111111111111";

// The conversation the fake admin client "finds". Swapped per test.
let conversationRow: Record<string, unknown> | null = null;
const conversationFilters: Record<string, unknown> = {};

vi.mock("../lib/supabase.js", () => {
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      conversationFilters[column] = value;
      return query;
    },
    maybeSingle: async () => ({ data: conversationRow, error: null }),
  };
  return { createApiSupabaseAdminClient: () => ({ from: () => query }) };
});

const seen: ToolContext[] = [];

function def(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: "lookup",
    description: "Look something up",
    inputSchema: z.object({ q: z.string() }),
    permission: "read",
    owner: "catalog",
    audiences: ["sales_agent"],
    needsApproval: false,
    audit: {},
    execute: async (ctx, input) => {
      seen.push(ctx);
      return { echoed: input };
    },
    ...overrides,
  };
}

function build(entries: ToolAuditEntry[]) {
  const registry = createToolRegistry();
  registry.register(def());
  registry.register(def({ name: "copilotOnly", audiences: ["copilot"] }));
  registry.register(def({ name: "saveNote", permission: "write" }));
  registry.register(def({ name: "refund", permission: "write", needsApproval: true }));
  registry.register(
    def({
      name: "failing",
      execute: async () => Promise.reject(new ToolError("out_of_cheese", "No cheese.", 422)),
    }),
  );

  const app = express();
  // No global body parser, like app.ts: the agent router parses its own.
  app.use(
    "/api/v1/agent",
    createAgentRouter({
      registry,
      audit: { record: async (entry) => void entries.push(entry) },
    }),
  );
  return app;
}

const auth = { Authorization: `Bearer ${TOKEN}` };

let entries: ToolAuditEntry[];

beforeEach(() => {
  vi.stubEnv("AGENT_SERVICE_TOKEN", TOKEN);
  entries = [];
  seen.length = 0;
  for (const key of Object.keys(conversationFilters)) delete conversationFilters[key];
  conversationRow = { id: CONVERSATION, workspace_id: "ws-A", seller_id: "seller-A", state: "ai_active" };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("agent surface auth", () => {
  it("does not exist when AGENT_SERVICE_TOKEN is unset", async () => {
    vi.stubEnv("AGENT_SERVICE_TOKEN", "");
    const app = build(entries);
    expect((await request(app).get("/api/v1/agent/tools").set(auth)).status).toBe(404);
    expect(
      (await request(app).post("/api/v1/agent/tools/lookup").set(auth).send({})).status,
    ).toBe(404);
  });

  it("rejects a missing or wrong token with 401", async () => {
    const app = build(entries);
    expect((await request(app).get("/api/v1/agent/tools")).status).toBe(401);
    expect(
      (await request(app).get("/api/v1/agent/tools").set("Authorization", "Bearer nope")).status,
    ).toBe(401);
    expect(
      (await request(app).get("/api/v1/agent/tools").set("Authorization", TOKEN)).status,
    ).toBe(401);
    const post = await request(app)
      .post("/api/v1/agent/tools/lookup")
      .set("Authorization", "Bearer nope")
      .send({ conversationId: CONVERSATION, input: { q: "x" } });
    expect(post.status).toBe(401);
    expect(post.body.ok).toBe(false);
  });
});

describe("agent surface and malformed bodies", () => {
  const malformed = (app: express.Express, headers: Record<string, string>) =>
    request(app)
      .post("/api/v1/agent/tools/lookup")
      .set(headers)
      .set("Content-Type", "application/json")
      .send("{not json");

  it("is 404 when the surface is off, whatever the body", async () => {
    vi.stubEnv("AGENT_SERVICE_TOKEN", "");
    expect((await malformed(build(entries), auth)).status).toBe(404);
  });

  it("is 401 with a wrong token, whatever the body", async () => {
    expect((await malformed(build(entries), { Authorization: "Bearer nope" })).status).toBe(401);
  });
});

describe("GET /tools", () => {
  it("lists sales-agent tools only, with JSON Schema", async () => {
    const response = await request(build(entries)).get("/api/v1/agent/tools").set(auth);
    expect(response.status).toBe(200);
    const names = response.body.data.map((t: { name: string }) => t.name);
    expect(names).toEqual(["lookup", "saveNote", "refund", "failing"]);
    expect(response.body.data[0]).toMatchObject({
      name: "lookup",
      description: "Look something up",
      permission: "read",
      owner: "catalog",
      needsApproval: false,
      inputSchema: { type: "object", required: ["q"] },
    });
  });
});

describe("POST /tools/:name", () => {
  const call = (app: express.Express, name: string, body: unknown) =>
    request(app).post(`/api/v1/agent/tools/${name}`).set(auth).send(body as object);

  it("runs the tool with the workspace taken from the conversation", async () => {
    const response = await call(build(entries), "lookup", {
      conversationId: CONVERSATION,
      input: { q: "kurta" },
      workspaceId: "ws-EVIL",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, output: { echoed: { q: "kurta" } } });
    expect(conversationFilters.id).toBe(CONVERSATION);
    expect(seen[0]).toMatchObject({
      workspaceId: "ws-A",
      sellerId: "seller-A",
      actor: "ai",
      audience: "sales_agent",
      conversationId: CONVERSATION,
    });
  });

  it("answers 404 for unknown and copilot-only tools", async () => {
    const app = build(entries);
    for (const name of ["nothing", "copilotOnly"]) {
      const response = await call(app, name, { conversationId: CONVERSATION, input: {} });
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ ok: false, error: { code: "unknown_tool" } });
    }
    expect(entries.map((e) => [e.toolName, e.errorCode, e.input])).toEqual([
      ["nothing", "unknown_tool", {}],
      ["copilotOnly", "unknown_tool", {}],
    ]);
  });

  it("answers 404 for an unknown conversation", async () => {
    conversationRow = null;
    const response = await call(build(entries), "lookup", {
      conversationId: CONVERSATION,
      input: { q: "x" },
    });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("conversation_not_found");
  });

  it("rejects a malformed body and invalid input with 400 { ok: false }", async () => {
    const app = build(entries);
    const badBody = await call(app, "lookup", { conversationId: "not-a-uuid", input: {} });
    expect(badBody.status).toBe(400);
    expect(badBody.body.ok).toBe(false);

    const badInput = await call(app, "lookup", { conversationId: CONVERSATION, input: { q: 1 } });
    expect(badInput.status).toBe(400);
    expect(badInput.body).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(entries.at(-1)).toMatchObject({ ok: false, errorCode: "invalid_input" });
  });

  it("refuses write tools unless the AI holds the conversation", async () => {
    const app = build(entries);
    for (const state of ["open", "waiting_approval", "human_takeover", "closed"]) {
      conversationRow = { ...conversationRow, state };
      const response = await call(app, "saveNote", {
        conversationId: CONVERSATION,
        input: { q: "x" },
      });
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("ai_not_allowed");
    }
    expect(seen).toHaveLength(0);
    expect(entries.map((e) => [e.toolName, e.ok, e.errorCode])).toEqual(
      Array(4).fill(["saveNote", false, "ai_not_allowed"]),
    );

    conversationRow = { ...conversationRow, state: "ai_active" };
    const allowed = await call(app, "saveNote", { conversationId: CONVERSATION, input: { q: "x" } });
    expect(allowed.status).toBe(200);
  });

  it("allows read tools whatever the conversation state", async () => {
    conversationRow = { ...conversationRow, state: "human_takeover" };
    const response = await call(build(entries), "lookup", {
      conversationId: CONVERSATION,
      input: { q: "x" },
    });
    expect(response.status).toBe(200);
  });

  it("refuses tools that need approval", async () => {
    const response = await call(build(entries), "refund", {
      conversationId: CONVERSATION,
      input: { q: "x" },
    });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("approval_required");
    expect(seen).toHaveLength(0);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      toolName: "refund",
      ok: false,
      errorCode: "approval_required",
      workspaceId: "ws-A",
    });
  });

  it("returns a tool's own error code and writes an audit entry", async () => {
    const response = await call(build(entries), "failing", {
      conversationId: CONVERSATION,
      input: { q: "x" },
    });
    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      ok: false,
      error: { code: "out_of_cheese", message: "No cheese." },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      toolName: "failing",
      audience: "sales_agent",
      actor: "ai",
      workspaceId: "ws-A",
      conversationId: CONVERSATION,
      ok: false,
      errorCode: "out_of_cheese",
    });
  });

  it("writes an audit entry for a successful call", async () => {
    await call(build(entries), "lookup", { conversationId: CONVERSATION, input: { q: "kurta" } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      toolName: "lookup",
      ok: true,
      errorCode: null,
      input: { q: "kurta" },
    });
  });
});
