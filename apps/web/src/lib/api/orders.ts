import type {
  OrderDetail,
  OrderListItem,
  OrderStatus,
} from "@pakcommerce/shared";
import type { ApiDataResponse, ApiListResponse } from "@pakcommerce/shared/api";

import { apiFetch } from "./api-client";

export interface OrderListParams {
  workspaceId: string;
  query?: string;
  statuses?: string[];
  channels?: string[];
  sort?: string;
  limit?: number;
  cursor?: string;
}

export interface OrderListResult {
  items: OrderListItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
  };
  nextCursor?: string | null;
}

export async function fetchOrders(params: OrderListParams): Promise<OrderListResult> {
  const searchParams = new URLSearchParams();
  searchParams.set("workspaceId", params.workspaceId);

  if (params.query?.trim()) searchParams.set("query", params.query.trim());
  if (params.statuses?.length) searchParams.set("statuses", params.statuses.join(","));
  if (params.channels?.length) searchParams.set("channels", params.channels.join(","));
  if (params.sort) searchParams.set("sort", params.sort);
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.cursor) searchParams.set("cursor", params.cursor);

  const response = await apiFetch<ApiListResponse<OrderListItem> & { nextCursor?: string | null }>(
    `/api/v1/orders?${searchParams.toString()}`,
  );

  return {
    items: response.data,
    meta: response.meta,
    nextCursor: response.nextCursor,
  };
}

export async function fetchOrderById(workspaceId: string, id: string): Promise<OrderDetail> {
  const response = await apiFetch<ApiDataResponse<OrderDetail>>(
    `/api/v1/orders/${id}?${new URLSearchParams({ workspaceId }).toString()}`,
  );
  return response.data;
}

export async function transitionOrder(
  workspaceId: string,
  id: string,
  toStatus: OrderStatus,
  note?: string,
): Promise<OrderDetail> {
  const response = await apiFetch<ApiDataResponse<OrderDetail>>(`/api/v1/orders/${id}/transition`, {
    method: "POST",
    body: JSON.stringify({ workspaceId, toStatus, ...(note?.trim() ? { note: note.trim() } : {}) }),
  });
  return response.data;
}
