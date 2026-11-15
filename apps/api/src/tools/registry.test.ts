import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  createToolRegistry,
  describeTool,
  redactInput,
  runTool,
  ToolError,
  toolInputJsonSchema,
  type ToolAuditEntry,
  type ToolContext,
  type ToolDefinition,
} from "./registry.js";
import { getTools } from "./index.js";

function tool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: "echo",
    description: "Echo",
    inputSchema: z.object({ text: z.string(), secret: z.string().optional() }),
    permission: "read",
    owner: "platform",
    audiences: ["copilot"],
    needsApproval: false,
    audit: { redact: ["secret"] },
    execute: async (_ctx, input) => input,
    ...overrides,
  };
}

function context(entries: ToolAuditEntry[]): ToolContext {
  return {
    db: {} as never,
    workspaceId: "w1",
    sellerId: "s1",
    actor: "ai",
    audience: "sales_agent",
    conversationId: "c1",
    audit: { record: async (entry) => void entries.push(entry) },
  };
}

describe("tool registry", () => {
  it("refuses duplicate names", () => {
    const registry = createToolRegistry();
    registry.register(tool());
    expect(() => registry.register(tool())).toThrow(/Duplicate/);
  });

  it("refuses a tool with no audience or a bad name", () => {
    const registry = createToolRegistry();
    expect(() => registry.register(tool({ audiences: [] }))).toThrow(/audience/);
    expect(() => registry.register(tool({ name: "bad name" }))).toThrow(/Invalid tool name/);
  });

  it("filters by audience", () => {
    const registry = createToolRegistry();
    registry.register(tool({ name: "a", audiences: ["copilot"] }));
    registry.register(tool({ name: "b", audiences: ["sales_agent"] }));
    registry.register(tool({ name: "c", audiences: ["copilot", "sales_agent"] }));

    expect(registry.list({ audience: "copilot" }).map((t) => t.name)).toEqual(["a", "c"]);
    expect(registry.list({ audience: "sales_agent" }).map((t) => t.name)).toEqual(["b", "c"]);
    expect(registry.list()).toHaveLength(3);
  });

  it("exports the input as JSON Schema", () => {
    const schema = toolInputJsonSchema(tool());
    expect(schema).toMatchObject({
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    });
    expect(describeTool(tool({ name: "x" }))).toMatchObject({
      name: "x",
      permission: "read",
      owner: "platform",
      needsApproval: false,
    });
  });

  it("redacts nested and array paths and leaves the original untouched", () => {
    const def = tool({ audit: { redact: ["customer.phone", "items.*.note"] } });
    const input = { customer: { phone: "0300", city: "Lahore" }, items: [{ note: "x", q: 1 }] };
    expect(redactInput(def, input)).toEqual({
      customer: { phone: "[redacted]", city: "Lahore" },
      items: [{ note: "[redacted]", q: 1 }],
    });
    expect(input.customer.phone).toBe("0300");
  });
});

describe("the shipped registry", () => {
  it("exposes only the two read tools to the sales agent, none needing approval", () => {
    const agentTools = getTools({ audience: "sales_agent" });
    expect(agentTools.map((t) => t.name).sort()).toEqual(["checkInventory", "searchProducts"]);
    expect(agentTools.every((t) => t.permission === "read" && !t.needsApproval)).toBe(true);
  });

  it("exports JSON Schema for every tool", () => {
    for (const def of getTools()) {
      expect(toolInputJsonSchema(def).type).toBe("object");
    }
  });
});

describe("audit never stores SQL or buyer text", () => {
  const sql = "update customers set name = 'Ayesha Khan' where phone = '+923001234567'";

  it("hashes SQL fields to kind, sha256 and length", () => {
    for (const name of ["queryDatabase", "mutateDatabase"]) {
      const def = getTools().find((t) => t.name === name)!;
      const stored = redactInput(def, {
        sql,
        summary: "Call Ayesha Khan 0300",
        queryDescription: "orders of +923001234567",
        reason: "she asked",
      });
      const text = JSON.stringify(stored);
      expect(text).not.toContain("Ayesha");
      expect(text).not.toContain("923001234567");
      expect(text).not.toContain("0300");
      expect(stored).toMatchObject({
        sql: { kind: "update", sha256: expect.stringMatching(/^[0-9a-f]{64}$/), length: sql.length },
      });
    }
  });

  it("redacts draft order customer details and notes", () => {
    const def = getTools().find((t) => t.name === "createDraftOrder")!;
    const text = JSON.stringify(
      redactInput(def, {
        customer: { name: "Ayesha Khan", phone: "+923001234567", addressLine: "12 Mall Rd" },
        notes: "deliver to Ayesha after 5",
        items: [{ quantity: 1 }],
      }),
    );
    for (const secret of ["Ayesha", "923001234567", "Mall Rd"]) {
      expect(text).not.toContain(secret);
    }
  });
});

describe("runTool", () => {
  it("audits a successful call with redacted input", async () => {
    const entries: ToolAuditEntry[] = [];
    const result = await runTool(tool(), context(entries), { text: "hi", secret: "pw" });

    expect(result).toEqual({ ok: true, output: { text: "hi", secret: "pw" } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      toolName: "echo",
      audience: "sales_agent",
      actor: "ai",
      sellerId: "s1",
      workspaceId: "w1",
      conversationId: "c1",
      ok: true,
      errorCode: null,
      input: { text: "hi", secret: "[redacted]" },
    });
    expect(entries[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("reports invalid input as invalid_input (400) and audits it", async () => {
    const entries: ToolAuditEntry[] = [];
    const result = await runTool(tool(), context(entries), { text: 5 });
    expect(result).toMatchObject({ ok: false, status: 400, error: { code: "invalid_input" } });
    expect(entries[0]).toMatchObject({ ok: false, errorCode: "invalid_input" });
  });

  it("maps ToolError and unexpected errors, hiding the latter's message", async () => {
    const entries: ToolAuditEntry[] = [];
    const known = await runTool(
      tool({ execute: async () => Promise.reject(new ToolError("nope", "Nope.", 404)) }),
      context(entries),
      { text: "x" },
    );
    expect(known).toMatchObject({ ok: false, status: 404, error: { code: "nope" } });

    const unknown = await runTool(
      tool({ execute: async () => Promise.reject(new Error("db password leaked")) }),
      context(entries),
      { text: "x" },
    );
    expect(unknown).toMatchObject({
      ok: false,
      status: 500,
      error: { code: "internal_error", message: "The tool failed." },
    });
    expect(entries.map((e) => e.errorCode)).toEqual(["nope", "internal_error"]);
  });

  it("flags a tool-reported error result in the audit but still returns it", async () => {
    const entries: ToolAuditEntry[] = [];
    const output = { status: "error", message: "x" };
    const result = await runTool(tool({ execute: async () => output }), context(entries), {
      text: "x",
    });
    expect(result).toEqual({ ok: true, output });
    expect(entries[0]).toMatchObject({ ok: false, errorCode: "tool_reported_error" });
  });

  it("survives a failing audit sink", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ctx = { ...context([]), audit: { record: async () => Promise.reject(new Error("down")) } };
    expect(await runTool(tool(), ctx, { text: "x" })).toMatchObject({ ok: true });
    spy.mockRestore();
  });
});
