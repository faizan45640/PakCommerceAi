import type { ApiDataResponse } from "@pakcommerce/shared/api";
import type { SalesAgentSettings } from "@pakcommerce/shared/conversations";

import { apiFetch } from "./api-client";

/** Sales agent settings for a workspace. Defaults (AI off, no policy) when never saved. */
export async function fetchSalesAgentSettings(workspaceId: string): Promise<SalesAgentSettings> {
  const response = await apiFetch<ApiDataResponse<SalesAgentSettings>>(
    `/api/v1/sales-agent/settings?${new URLSearchParams({ workspaceId }).toString()}`,
  );
  return response.data;
}

export async function saveSalesAgentSettings(
  settings: Pick<SalesAgentSettings, "workspaceId" | "aiEnabled" | "policyText">,
): Promise<SalesAgentSettings> {
  const response = await apiFetch<ApiDataResponse<SalesAgentSettings>>("/api/v1/sales-agent/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
  return response.data;
}
