import { describe, expect, it } from "vitest";

import {
  aiReplyArrived,
  buildMockInboundPayload,
  shouldStopPolling,
  validateSimulatorForm,
} from "./buyer-simulator-model";

const form = { phone: "+92 300 1234567", name: " Ayesha ", message: " Salam, price? " };

describe("buildMockInboundPayload", () => {
  it("builds Twilio-style fields and omits aiEnabled", () => {
    const payload = buildMockInboundPayload("w1", form);
    expect(payload).toEqual({
      workspaceId: "w1",
      From: "whatsapp:+923001234567",
      ProfileName: "Ayesha",
      Body: "Salam, price?",
    });
    expect("aiEnabled" in payload).toBe(false);
  });

  it("omits a blank name", () => {
    expect("ProfileName" in buildMockInboundPayload("w1", { ...form, name: " " })).toBe(false);
  });
});

describe("validateSimulatorForm", () => {
  it("accepts a good form and rejects bad phone or empty message", () => {
    expect(validateSimulatorForm(form)).toBeNull();
    expect(validateSimulatorForm({ ...form, phone: "abc" })).not.toBeNull();
    expect(validateSimulatorForm({ ...form, message: "  " })).not.toBeNull();
  });
});

describe("aiReplyArrived", () => {
  it("is true only for an AI message newer than the inbound one", () => {
    expect(aiReplyArrived([{ id: "a", sender: "ai" }, { id: "in", sender: "buyer" }], "in")).toBe(true);
    expect(aiReplyArrived([{ id: "in", sender: "buyer" }, { id: "old", sender: "ai" }], "in")).toBe(false);
    expect(aiReplyArrived([], "in")).toBe(false);
  });
});

describe("shouldStopPolling", () => {
  it("stops on reply, state change or timeout", () => {
    expect(shouldStopPolling({ aiReplied: false, state: "ai_active", elapsedMs: 4000 })).toBe(false);
    expect(shouldStopPolling({ aiReplied: true, state: "ai_active", elapsedMs: 4000 })).toBe(true);
    expect(shouldStopPolling({ aiReplied: false, state: "human_takeover", elapsedMs: 4000 })).toBe(true);
    expect(shouldStopPolling({ aiReplied: false, state: "ai_active", elapsedMs: 60_000 })).toBe(true);
  });
});
