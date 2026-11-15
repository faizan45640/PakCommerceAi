import type { ApiDataResponse } from "@pakcommerce/shared/api";
import type { SalesAgentSettings as BaseSalesAgentSettings } from "@pakcommerce/shared/conversations";

import { apiFetch } from "./api-client";

// TODO(shared): replace with @pakcommerce/shared once T-086 lands.
export interface SalesAgentSettings extends BaseSalesAgentSettings {
  /** On: the AI confirms orders the buyer confirms twice. Off: the seller approves each one. */
  autoConfirmOrders: boolean;
  shippingFee: { amountMinor: number; currency: "PKR" };
}

/** Sales agent settings for a workspace. Defaults (AI off, no policy) when never saved. */
export async function fetchSalesAgentSettings(workspaceId: string): Promise<SalesAgentSettings> {
  const response = await apiFetch<ApiDataResponse<SalesAgentSettings>>(
    `/api/v1/sales-agent/settings?${new URLSearchParams({ workspaceId }).toString()}`,
  );
  return response.data;
}

export async function saveSalesAgentSettings(
  settings: Pick<SalesAgentSettings, "workspaceId" | "aiEnabled" | "policyText" | "autoConfirmOrders" | "shippingFee">,
): Promise<SalesAgentSettings> {
  const response = await apiFetch<ApiDataResponse<SalesAgentSettings>>("/api/v1/sales-agent/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
  return response.data;
}
