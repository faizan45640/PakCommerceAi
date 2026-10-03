import { describe, expect, it } from "vitest";

import { fallbackChatTitle, firstUserText, TITLE_MAX } from "./chat-title.js";
import type { UIMessage } from "ai";

function userMessage(text: string): UIMessage {
  return { id: "1", role: "user", parts: [{ type: "text", text }] };
}

describe("chat title helpers", () => {
  it("reads the first user message", () => {
    expect(firstUserText([userMessage("How are you my name is faizan")])).toBe(
      "How are you my name is faizan",
    );
    expect(firstUserText([])).toBeNull();
  });

  it("keeps the fallback short enough for the sidebar", () => {
    const long = "a".repeat(80);
    expect(fallbackChatTitle(long).length).toBeLessThanOrEqual(TITLE_MAX);
    expect(fallbackChatTitle("Low stock check")).toBe("Low stock check");
  });
});
