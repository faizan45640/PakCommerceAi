import type {
  ApiListResponse,
  ApiDataResponse,
} from "@pakcommerce/shared/api";
import type {
  CreateProductInput,
  Product,
  ProductListItem,
  UpdateProductInput,
  Workspace,
} from "@pakcommerce/shared";

import { apiFetch } from "./api-client";

export async function fetchCurrentWorkspace(): Promise<Workspace> {
  const response = await apiFetch<ApiDataResponse<Workspace>>("/api/v1/workspaces/current");
  return response.data;
}

export interface ProductListParams {
  workspaceId: string;
  query?: string;
  statuses?: string[];
  inventoryStates?: string[];
  sort?: string;
  limit?: number;
  cursor?: string;
}

export interface ProductListResult {
  items: ProductListItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
  };
  nextCursor?: string | null;
}

export async function fetchProducts(params: ProductListParams): Promise<ProductListResult> {
  const searchParams = new URLSearchParams();
  searchParams.set("workspaceId", params.workspaceId);

  if (params.query?.trim()) {
    searchParams.set("query", params.query.trim());
  }

  if (params.statuses && params.statuses.length > 0) {
    searchParams.set("statuses", params.statuses.join(","));
  }

  if (params.inventoryStates && params.inventoryStates.length > 0) {
    searchParams.set("inventoryStates", params.inventoryStates.join(","));
  }

  if (params.sort) {
    searchParams.set("sort", params.sort);
  }

  if (params.limit) {
    searchParams.set("limit", String(params.limit));
  }

  if (params.cursor) {
    searchParams.set("cursor", params.cursor);
  }

  const response = await apiFetch<ApiListResponse<ProductListItem> & { nextCursor?: string | null }>(
    `/api/v1/products?${searchParams.toString()}`,
  );

  return {
    items: response.data,
    meta: response.meta,
    nextCursor: response.nextCursor,
  };
}

export async function fetchProductById(id: string): Promise<Product> {
  const response = await apiFetch<ApiDataResponse<Product>>(`/api/v1/products/${id}`);
  return response.data;
}

export async function createProductApi(input: CreateProductInput): Promise<Product> {
  const response = await apiFetch<ApiDataResponse<Product>>("/api/v1/products", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function updateProductApi(id: string, input: UpdateProductInput): Promise<Product> {
  const response = await apiFetch<ApiDataResponse<Product>>(`/api/v1/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function archiveProductApi(id: string): Promise<Product> {
  const response = await apiFetch<ApiDataResponse<Product>>(`/api/v1/products/${id}`, {
    method: "DELETE",
  });
  return response.data;
}
