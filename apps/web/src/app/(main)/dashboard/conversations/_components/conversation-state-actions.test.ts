import { describe, expect, it } from "vitest";
import { conversationStateValues } from "@pakcommerce/shared/conversations";

import { availableStateActions } from "./conversation-thread-model";

const labels = (state: Parameters<typeof availableStateActions>[0]) =>
  availableStateActions(state).map((action) => action.label);

describe("availableStateActions", () => {
  it("offers take over, turn AI on and close for an open conversation", () => {
    expect(labels("open")).toEqual(["Take over", "Turn AI on", "Close"]);
  });

  it("offers take over, turn AI off and close while the AI is active", () => {
    expect(labels("ai_active")).toEqual(["Take over", "Turn AI off", "Close"]);
  });

  it("offers hand back, turn AI off and close during takeover", () => {
    expect(availableStateActions("human_takeover")).toEqual([
      { to: "ai_active", label: "Hand back to AI" },
      { to: "open", label: "Turn AI off" },
      { to: "closed", label: "Close" },
    ]);
  });

  it("lets the seller resolve a pending approval", () => {
    expect(labels("waiting_approval")).toEqual(["Take over", "Hand back to AI", "Turn AI off", "Close"]);
  });

  it("only offers reopen on a closed conversation", () => {
    expect(availableStateActions("closed")).toEqual([{ to: "open", label: "Reopen" }]);
  });

  it("never offers the current state", () => {
    for (const state of conversationStateValues) {
      expect(availableStateActions(state).map((action) => action.to)).not.toContain(state);
    }
  });
});
