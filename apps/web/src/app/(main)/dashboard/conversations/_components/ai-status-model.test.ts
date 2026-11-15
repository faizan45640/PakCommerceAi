import { describe, expect, it } from "vitest";

import { AI_STATE_HEADLINES, handoffLine, lastAiActionLine, toolLabel } from "./ai-status-model";

const now = new Date("2026-11-15T10:00:00Z");

describe("AI_STATE_HEADLINES", () => {
  it("uses plain words for every state", () => {
    expect(AI_STATE_HEADLINES.ai_active).toBe("AI is replying");
    expect(AI_STATE_HEADLINES.waiting_approval).toBe("Waiting for your approval");
    expect(AI_STATE_HEADLINES.human_takeover).toBe("You're handling this — AI paused");
    expect(AI_STATE_HEADLINES.open).toBe("AI off");
    expect(AI_STATE_HEADLINES.closed).toBe("Closed");
  });
});

describe("handoffLine", () => {
  it("shows the reason only in human takeover", () => {
    expect(handoffLine("human_takeover", " buyer asked for a person ")).toBe(
      "AI handed over: buyer asked for a person",
    );
    expect(handoffLine("ai_active", "x")).toBeNull();
    expect(handoffLine("human_takeover", null)).toBeNull();
    expect(handoffLine("human_takeover", "  ")).toBeNull();
  });
});

describe("toolLabel", () => {
  it("humanises unknown tools", () => {
    expect(toolLabel("checkInventory")).toBe("Checked stock");
    expect(toolLabel("searchProducts")).toBe("Product search");
    expect(toolLabel("lookUpOrder")).toBe("Look up order");
    expect(toolLabel("look_up_order")).toBe("Look up order");
  });
});

describe("lastAiActionLine", () => {
  const call = (tool: string, ok: boolean, at: string) => ({
    tool,
    ok,
    errorCode: ok ? null : "x",
    durationMs: 5,
    at,
  });

  it("is null when the AI did nothing", () => {
    expect(lastAiActionLine({ lastAiMessageAt: null, recentToolCalls: [] }, now)).toBeNull();
  });

  it("reports a reply when it is the newest action", () => {
    const line = lastAiActionLine(
      {
        lastAiMessageAt: "2026-11-15T09:58:00Z",
        recentToolCalls: [call("checkInventory", true, "2026-11-15T09:57:00Z")],
      },
      now,
    );
    expect(line).toBe("Replied 2 minutes ago");
  });

  it("reports a newer tool call, ok or failed", () => {
    expect(
      lastAiActionLine(
        {
          lastAiMessageAt: "2026-11-15T09:00:00Z",
          recentToolCalls: [call("checkInventory", true, "2026-11-15T09:59:00Z")],
        },
        now,
      ),
    ).toBe("Checked stock: ok");
    expect(
      lastAiActionLine(
        { lastAiMessageAt: null, recentToolCalls: [call("searchProducts", false, "2026-11-15T09:59:00Z")] },
        now,
      ),
    ).toBe("Product search failed");
  });
});
