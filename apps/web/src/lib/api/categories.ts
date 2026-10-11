import type { ApiDataResponse } from "@pakcommerce/shared/api";
import type { Category, CreateCategoryInput, UpdateCategoryInput } from "@pakcommerce/shared";

import { apiFetch } from "./api-client";

export async function fetchCategories(workspaceId: string): Promise<Category[]> {
  const response = await apiFetch<ApiDataResponse<Category[]>>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/categories`,
  );
  return response.data;
}

export async function createCategory(
  workspaceId: string,
  input: CreateCategoryInput,
): Promise<Category> {
  const response = await apiFetch<ApiDataResponse<Category>>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/categories`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return response.data;
}

export async function updateCategory(
  workspaceId: string,
  id: string,
  input: UpdateCategoryInput,
): Promise<Category> {
  const response = await apiFetch<ApiDataResponse<Category>>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/categories/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
  return response.data;
}

export async function deleteCategory(workspaceId: string, id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/categories/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
}
