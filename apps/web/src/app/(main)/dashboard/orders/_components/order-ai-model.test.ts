import { describe, expect, it } from "vitest";

import { conversationHref, createdViaBadge } from "./order-ai-model";

describe("createdViaBadge", () => {
  it("labels AI and copilot orders only", () => {
    expect(createdViaBadge("whatsapp_ai")).toEqual({ label: "Placed by AI · WhatsApp", tone: "success" });
    expect(createdViaBadge("copilot")?.label).toBe("Copilot");
    expect(createdViaBadge("manual")).toBeNull();
    expect(createdViaBadge(undefined)).toBeNull();
  });
});

describe("conversationHref", () => {
  it("links to the inbox with the conversation selected", () => {
    expect(conversationHref("c1")).toBe("/dashboard/conversations?c=c1");
    expect(conversationHref(null)).toBeNull();
  });
});
