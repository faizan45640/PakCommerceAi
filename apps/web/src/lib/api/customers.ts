import type {
  CreateCustomerNoteInput,
  CustomerDetail,
  CustomerListItem,
  CustomerNote,
  CustomerSort,
  CustomerTag,
} from "@pakcommerce/shared";
import type { ApiDataResponse, ApiListResponse } from "@pakcommerce/shared/api";

import { apiFetch } from "./api-client";

export interface CustomerListParams {
  workspaceId: string;
  query?: string;
  /** Exact match on the phone (the API normalises it). */
  phone?: string;
  /** A customer must have all of these. */
  tags?: CustomerTag[];
  sort?: CustomerSort;
  limit?: number;
  cursor?: string;
}

export interface CustomerListResult {
  items: CustomerListItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
  };
  nextCursor?: string | null;
}

/** Builds the `GET /customers` query string; blank values are left out. */
export function buildCustomerListSearchParams(params: CustomerListParams): URLSearchParams {
  const searchParams = new URLSearchParams();
  searchParams.set("workspaceId", params.workspaceId);

  if (params.query?.trim()) searchParams.set("query", params.query.trim());
  if (params.phone?.trim()) searchParams.set("phone", params.phone.trim());
  if (params.tags?.length) searchParams.set("tags", params.tags.join(","));
  if (params.sort) searchParams.set("sort", params.sort);
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.cursor) searchParams.set("cursor", params.cursor);

  return searchParams;
}

export async function fetchCustomers(params: CustomerListParams): Promise<CustomerListResult> {
  const response = await apiFetch<ApiListResponse<CustomerListItem> & { nextCursor?: string | null }>(
    `/api/v1/customers?${buildCustomerListSearchParams(params).toString()}`,
  );

  return {
    items: response.data,
    meta: response.meta,
    nextCursor: response.nextCursor,
  };
}

export async function fetchCustomerById(workspaceId: string, id: string): Promise<CustomerDetail> {
  const response = await apiFetch<ApiDataResponse<CustomerDetail>>(
    `/api/v1/customers/${id}?${new URLSearchParams({ workspaceId }).toString()}`,
  );
  return response.data;
}

/** Exact phone lookup (any format); the first match, or null when there is none. */
export async function fetchCustomerByPhone(
  workspaceId: string,
  phone: string,
): Promise<CustomerListItem | null> {
  const result = await fetchCustomers({ workspaceId, phone, limit: 1 });
  return result.items[0] ?? null;
}

export async function createCustomerNote(
  customerId: string,
  input: CreateCustomerNoteInput,
): Promise<CustomerNote> {
  const response = await apiFetch<ApiDataResponse<CustomerNote>>(`/api/v1/customers/${customerId}/notes`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function deleteCustomerNote(
  workspaceId: string,
  customerId: string,
  noteId: string,
): Promise<void> {
  await apiFetch<void>(
    `/api/v1/customers/${customerId}/notes/${noteId}?${new URLSearchParams({ workspaceId }).toString()}`,
    { method: "DELETE" },
  );
}
