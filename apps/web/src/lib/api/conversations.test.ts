import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "./api-client";
import {
  buildConversationListSearchParams,
  fetchConversationById,
  fetchConversations,
  fetchMessages,
  markConversationRead,
} from "./conversations";

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

describe("thread endpoints", () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());

  it("fetches one conversation and unwraps data", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: { id: "c1" } });
    await expect(fetchConversationById("w1", "c1")).resolves.toEqual({ id: "c1" });
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/conversations/c1?workspaceId=w1");
  });

  it("pages messages with the cursor", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: [{ id: "m1" }], meta: {}, nextCursor: null });
    const result = await fetchMessages("c1", { workspaceId: "w1", limit: 50, cursor: "old" });
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/conversations/c1/messages?workspaceId=w1&limit=50&cursor=old");
    expect(result).toEqual({ items: [{ id: "m1" }], nextCursor: null });
  });

  it("encodes ids in path segments", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: [], meta: {} });
    await fetchMessages("a/b?c", { workspaceId: "w1" });
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/conversations/a%2Fb%3Fc/messages?workspaceId=w1");
  });

  it("posts mark-as-read", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: { id: "c1", unreadCount: 0 } });
    const conversation = await markConversationRead("w1", "c1");
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/conversations/c1/read?workspaceId=w1", { method: "POST" });
    expect(conversation.unreadCount).toBe(0);
  });
});
