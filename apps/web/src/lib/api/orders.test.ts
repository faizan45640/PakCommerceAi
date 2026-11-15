import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "./api-client";
import { fetchOrders } from "./orders";

vi.mock("./api-client", () => ({ apiFetch: vi.fn() }));

describe("fetchOrders", () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());

  it("filters by conversation and returns the AI fields", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      data: [{ id: "o1", createdVia: "whatsapp_ai", conversationId: "c1" }],
      meta: { page: 1, pageSize: 25, total: 1 },
    });
    const result = await fetchOrders({ workspaceId: "w1", conversationId: "c1" });
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/orders?workspaceId=w1&conversationId=c1");
    expect(result.items[0].createdVia).toBe("whatsapp_ai");
  });
});
