import { describe, expect, it } from "vitest";
import { conversationStateValues } from "@pakcommerce/shared/conversations";

import {
  CONVERSATION_STATE_LABELS,
  CONVERSATION_STATE_TONES,
  buyerDisplayName,
  formatPhone,
  relativeTime,
} from "./conversation-display";

describe("conversation display", () => {
  it("labels every state", () => {
    for (const state of conversationStateValues) {
      expect(CONVERSATION_STATE_LABELS[state]).toBeTruthy();
      expect(CONVERSATION_STATE_TONES[state]).toBeTruthy();
    }
    expect(CONVERSATION_STATE_LABELS.human_takeover).toBe("You're handling");
    expect(CONVERSATION_STATE_LABELS.waiting_approval).toBe("Needs approval");
  });

  it("formats Pakistani numbers and leaves others alone", () => {
    expect(formatPhone("+923001234567")).toBe("+92 300 1234567");
    expect(formatPhone("+14155550123")).toBe("+14155550123");
  });

  it("falls back to the phone when the buyer has no name", () => {
    expect(buyerDisplayName({ buyerName: "Aisha", buyerPhone: "+923001234567" })).toBe("Aisha");
    expect(buyerDisplayName({ buyerName: "  ", buyerPhone: "+923001234567" })).toBe("+92 300 1234567");
    expect(buyerDisplayName({ buyerName: null, buyerPhone: "+923001234567" })).toBe("+92 300 1234567");
  });

  it("formats relative time", () => {
    const now = new Date("2026-11-15T12:00:00Z");
    expect(relativeTime(null, now)).toBe("");
    expect(relativeTime("2026-11-15T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-11-15T11:55:00Z", now)).toBe("5 minutes ago");
    expect(relativeTime("2026-11-15T09:00:00Z", now)).toBe("3 hours ago");
  });
});
