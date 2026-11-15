import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { ToolAuditEntry, ToolDefinition } from "../tools/registry.js";
import { getTools } from "../tools/registry.js";
import "../tools/definitions.js";
import { copilotToolContext, toAiSdkTools, toolApprovalMap } from "./ai-sdk-adapter.js";
import { createCopilotTools } from "./tools/index.js";

const auth = { sellerId: "s1", db: {} as never };

describe("AI SDK adapter", () => {
  it("serves exactly the tools the copilot always had", () => {
    const registryNames = getTools({ audience: "copilot" })
      .map((t) => t.name)
      .sort();
    expect(registryNames).toEqual(Object.keys(createCopilotTools(auth)).sort());
  });

  it("keeps the approval map: the five write tools, nothing else", () => {
    expect(toolApprovalMap(getTools({ audience: "copilot" }))).toEqual({
      mutateDatabase: "user-approval",
      updateProductStock: "user-approval",
      updateProductPrice: "user-approval",
      updateProductDetails: "user-approval",
      createDraftOrder: "user-approval",
    });
  });

  it("keeps needsApproval on the tool objects like before", () => {
    const tools = toAiSdkTools(getTools({ audience: "copilot" }), copilotToolContext(auth));
    expect(tools.updateProductStock!.needsApproval).toBe(true);
    expect(tools.searchProducts!.needsApproval).toBeUndefined();
  });

  it("keeps the original descriptions and schemas", () => {
    const original = createCopilotTools(auth);
    const tools = toAiSdkTools(getTools({ audience: "copilot" }), copilotToolContext(auth));
    for (const [name, tool] of Object.entries(original)) {
      expect(tools[name]!.description).toBe(tool.description);
      expect(tools[name]!.inputSchema).toBe(tool.inputSchema);
    }
  });

  it("runs the tool, audits it as the seller, and rethrows the original error", async () => {
    const entries: ToolAuditEntry[] = [];
    const boom = new Error("boom");
    const base = {
      description: "d",
      inputSchema: z.object({}),
      permission: "read" as const,
      owner: "platform" as const,
      audiences: ["copilot" as const],
      needsApproval: false,
      audit: {},
    };
    const defs: ToolDefinition[] = [
      { ...base, name: "ok", execute: async () => ({ fine: true }) },
      { ...base, name: "bad", execute: async () => Promise.reject(boom) },
    ];
    const tools = toAiSdkTools(
      defs,
      copilotToolContext(auth, { record: async (entry) => void entries.push(entry) }),
    );

    expect(await tools.ok!.execute({})).toEqual({ fine: true });
    await expect(tools.bad!.execute({})).rejects.toBe(boom);
    expect(entries.map((e) => [e.toolName, e.actor, e.audience, e.ok])).toEqual([
      ["ok", "seller", "copilot", true],
      ["bad", "seller", "copilot", false],
    ]);
  });
});
