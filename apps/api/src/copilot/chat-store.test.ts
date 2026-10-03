import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import { applyIncomingMessage } from "./chat-store.js";

function userMessage(id: string, text: string): UIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

describe("copilot chat store", () => {
  it("appends a new message and replaces one that is already stored", () => {
    const first = userMessage("user-1", "Hello");
    const reply = { id: "assistant-1", role: "assistant", parts: [{ type: "text", text: "Hi" }] } as UIMessage;
    const stored = [first, reply];
    const next = userMessage("user-2", "And stock?");

    expect(applyIncomingMessage(stored, next).map((message) => message.id)).toEqual([
      "user-1",
      "assistant-1",
      "user-2",
    ]);

    const approved = {
      ...reply,
      parts: [{ type: "text", text: "Approved" }],
    } as UIMessage;

    expect(applyIncomingMessage(stored, approved)).toEqual([first, approved]);
  });
});
