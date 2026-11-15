import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "./api-client";
import { buildConversationListSearchParams, fetchConversations } from "./conversations";

vi.mock("./api-client", () => ({ apiFetch: vi.fn() }));

describe("buildConversationListSearchParams", () => {
  it("always sends the workspace and nothing blank", () => {
    const params = buildConversationListSearchParams({ workspaceId: "w1", query: "  ", states: [] });
    expect(params.toString()).toBe("workspaceId=w1");
  });

  it("trims the query, joins states and sends unreadOnly only when on", () => {
    const params = buildConversationListSearchParams({
      workspaceId: "w1",
      query: " Aisha ",
      states: ["open", "ai_active"],
      unreadOnly: true,
      limit: 25,
      cursor: "abc",
    });
    expect(params.get("query")).toBe("Aisha");
    expect(params.get("states")).toBe("open,ai_active");
    expect(params.get("unreadOnly")).toBe("true");
    expect(params.get("limit")).toBe("25");
    expect(params.get("cursor")).toBe("abc");
    expect(buildConversationListSearchParams({ workspaceId: "w1", unreadOnly: false }).has("unreadOnly")).toBe(
      false,
    );
  });
});

describe("fetchConversations", () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());

  it("maps the list envelope", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      data: [{ id: "c1" }],
      meta: { page: 1, pageSize: 25, total: 1 },
      nextCursor: "next",
    });
    const result = await fetchConversations({ workspaceId: "w1", states: ["open"] });
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/conversations?workspaceId=w1&states=open");
    expect(result.items).toEqual([{ id: "c1" }]);
    expect(result.nextCursor).toBe("next");
  });
});
