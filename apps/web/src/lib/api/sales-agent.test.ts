import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "./api-client";
import { fetchSalesAgentSettings, saveSalesAgentSettings } from "./sales-agent";

vi.mock("./api-client", () => ({ apiFetch: vi.fn() }));

const settings = { workspaceId: "w1", aiEnabled: true, policyText: "COD available" };

beforeEach(() => vi.mocked(apiFetch).mockReset());

describe("sales agent settings client", () => {
  it("reads settings for the workspace", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: settings });
    expect(await fetchSalesAgentSettings("w1")).toEqual(settings);
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/sales-agent/settings?workspaceId=w1");
  });

  it("saves with PUT and the full body", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: settings });
    await saveSalesAgentSettings(settings);
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/sales-agent/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    });
  });
});
