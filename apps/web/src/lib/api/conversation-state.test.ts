import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "./api-client";
import { changeConversationState } from "./conversations";

vi.mock("./api-client", () => ({ apiFetch: vi.fn() }));

describe("changeConversationState", () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());

  it("posts the target state and returns the conversation", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: { id: "c1", state: "human_takeover" } });

    const conversation = await changeConversationState("w1", "c/1", "human_takeover", "  VIP ");

    expect(apiFetch).toHaveBeenCalledWith("/api/v1/conversations/c%2F1/state", {
      method: "POST",
      body: JSON.stringify({ workspaceId: "w1", to: "human_takeover", reason: "VIP" }),
    });
    expect(conversation.state).toBe("human_takeover");
  });

  it("leaves a blank reason out", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: { id: "c1" } });
    await changeConversationState("w1", "c1", "closed", "  ");
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/conversations/c1/state", {
      method: "POST",
      body: JSON.stringify({ workspaceId: "w1", to: "closed" }),
    });
  });
});
