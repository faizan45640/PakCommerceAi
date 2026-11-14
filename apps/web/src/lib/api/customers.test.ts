import { describe, expect, it } from "vitest";

import { buildCustomerListSearchParams } from "./customers";

describe("buildCustomerListSearchParams", () => {
  it("always sends the workspace and nothing blank", () => {
    const params = buildCustomerListSearchParams({ workspaceId: "w1", query: "   ", tags: [] });
    expect(params.toString()).toBe("workspaceId=w1");
  });

  it("trims the query and joins tags with commas", () => {
    const params = buildCustomerListSearchParams({
      workspaceId: "w1",
      query: "  Aisha ",
      tags: ["repeat", "flagged"],
      sort: "spend_desc",
      limit: 10,
      cursor: "abc",
    });
    expect(params.get("query")).toBe("Aisha");
    expect(params.get("tags")).toBe("repeat,flagged");
    expect(params.get("sort")).toBe("spend_desc");
    expect(params.get("limit")).toBe("10");
    expect(params.get("cursor")).toBe("abc");
  });

  it("passes the phone filter", () => {
    const params = buildCustomerListSearchParams({ workspaceId: "w1", phone: " +923001234567 " });
    expect(params.get("phone")).toBe("+923001234567");
  });
});
