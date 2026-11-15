import { describe, expect, it } from "vitest";

import { ApiRequestError } from "@/lib/api/api-client";

import {
  approvalSuccessMessage,
  isStaleApproval,
  isWaitingApproval,
  ordersRefreshKey,
  pickPendingDraft,
} from "./conversation-orders-model";

const order = (id: string, status: string, createdVia: "manual" | "copilot" | "whatsapp_ai") => ({
  id,
  status,
  createdVia,
  conversationId: "c1",
});

describe("pickPendingDraft", () => {
  it("takes the first AI draft and ignores other orders", () => {
    const orders = [
      order("a", "confirmed", "whatsapp_ai"),
      order("b", "draft", "manual"),
      order("c", "draft", "whatsapp_ai"),
      order("d", "draft", "whatsapp_ai"),
    ];
    expect(pickPendingDraft(orders)?.id).toBe("c");
    expect(pickPendingDraft([order("a", "cancelled", "whatsapp_ai")])).toBeNull();
    expect(pickPendingDraft([])).toBeNull();
  });
});

describe("approval state", () => {
  it("knows when approval is pending", () => {
    expect(isWaitingApproval({ state: "waiting_approval" })).toBe(true);
    expect(isWaitingApproval({ state: "ai_active" })).toBe(false);
    expect(isWaitingApproval(null)).toBe(false);
  });

  it("words the outcome", () => {
    expect(approvalSuccessMessage("approve")).toMatch(/approved/);
    expect(approvalSuccessMessage("reject")).toMatch(/rejected/);
  });

  it("treats only 409 as stale", () => {
    expect(isStaleApproval(new ApiRequestError("x", "conflict", 409))).toBe(true);
    expect(isStaleApproval(new ApiRequestError("x", "internal_error", 500))).toBe(false);
    expect(isStaleApproval(new Error("x"))).toBe(false);
  });
});

describe("ordersRefreshKey", () => {
  it("changes with the tick or this conversation's update", () => {
    const base = ordersRefreshKey(0, null, "c1");
    expect(ordersRefreshKey(1, null, "c1")).not.toBe(base);
    const updated = { id: "c1", state: "ai_active" as const, updatedAt: "t1" };
    expect(ordersRefreshKey(0, updated, "c1")).not.toBe(base);
    expect(ordersRefreshKey(0, { ...updated, id: "other" }, "c1")).toBe(base);
  });
});
