import type {
  CreateDraftOrderInput,
  Order,
  OrderDetail,
  OrderListItem,
  OrderStatus,
} from "@pakcommerce/shared";
import type { ApiDataResponse, ApiListResponse } from "@pakcommerce/shared/api";

import { apiFetch } from "./api-client";

// TODO(shared): replace with @pakcommerce/shared once T-086 lands.
export type OrderCreatedVia = "manual" | "copilot" | "whatsapp_ai";

/** AI-order fields the API adds to list items and detail. */
export interface OrderAiFields {
  createdVia: OrderCreatedVia;
  conversationId: string | null;
}

export type OrderListItemWithAi = OrderListItem & OrderAiFields;
export type OrderDetailWithAi = OrderDetail & OrderAiFields;

export interface OrderListParams {
  workspaceId: string;
  query?: string;
  /** Only this customer's orders. */
  customerId?: string;
  /** Only orders created from this conversation. */
  conversationId?: string;
  statuses?: string[];
  channels?: string[];
  sort?: string;
  limit?: number;
  cursor?: string;
}

export interface OrderListResult {
  items: OrderListItemWithAi[];
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
  if (params.customerId) searchParams.set("customerId", params.customerId);
  if (params.conversationId) searchParams.set("conversationId", params.conversationId);
  if (params.statuses?.length) searchParams.set("statuses", params.statuses.join(","));
  if (params.channels?.length) searchParams.set("channels", params.channels.join(","));
  if (params.sort) searchParams.set("sort", params.sort);
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.cursor) searchParams.set("cursor", params.cursor);

  const response = await apiFetch<ApiListResponse<OrderListItemWithAi> & { nextCursor?: string | null }>(
    `/api/v1/orders?${searchParams.toString()}`,
  );

  return {
    items: response.data,
    meta: response.meta,
    nextCursor: response.nextCursor,
  };
}

export async function fetchOrderById(workspaceId: string, id: string): Promise<OrderDetailWithAi> {
  const response = await apiFetch<ApiDataResponse<OrderDetailWithAi>>(
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

export async function createDraftOrder(input: CreateDraftOrderInput): Promise<Order> {
  const response = await apiFetch<ApiDataResponse<Order>>("/api/v1/orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.data;
}
