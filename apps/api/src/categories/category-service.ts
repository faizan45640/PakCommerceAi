import type { Database, Json } from "@pakcommerce/integrations/supabase";
import type { Category, CreateCategoryInput, UpdateCategoryInput } from "@pakcommerce/shared";
import { ConflictError, NotFoundError, ValidationError } from "../lib/http-errors.js";
import type { SellerContext } from "../products/seller-context.js";
import { slugifyCategory } from "./category-slug.js";

interface CategoryRow {
  id: string;
  workspace_id: string;
  seller_id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  channel_mappings: unknown;
  created_at: string;
  updated_at: string;
}

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sellerId: row.seller_id,
    parentId: row.parent_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    channelMappings:
      typeof row.channel_mappings === "object" && row.channel_mappings !== null
        ? (row.channel_mappings as Record<string, unknown>)
        : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCategories(
  auth: SellerContext,
  workspaceId: string,
): Promise<Category[]> {
  const { data, error } = await auth.db
    .from("categories")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as CategoryRow[]).map(toCategory);
}

export async function createCategory(
  auth: SellerContext,
  workspaceId: string,
  input: CreateCategoryInput,
): Promise<Category> {
  const name = input.name.trim();
  if (!name) {
    throw new ValidationError("Category name is required.");
  }

  const slug = (input.slug?.trim() ? input.slug.trim() : slugifyCategory(name)).toLowerCase();

  // If parentId provided, verify it exists in this workspace
  if (input.parentId) {
    const { data: parent, error: parentError } = await auth.db
      .from("categories")
      .select("id")
      .eq("id", input.parentId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (parentError) throw parentError;
    if (!parent) {
      throw new NotFoundError(`Parent category ${input.parentId} not found in this workspace.`);
    }
  }

  const { data, error } = await auth.db
    .from("categories")
    .insert({
      workspace_id: workspaceId,
      seller_id: auth.sellerId,
      parent_id: input.parentId ?? null,
      name,
      slug,
      description: input.description ?? null,
      channel_mappings: (input.channelMappings ?? {}) as Json,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new ConflictError(`A category with slug "${slug}" already exists in this workspace.`);
    }
    throw error;
  }

  return toCategory(data as unknown as CategoryRow);
}

export async function updateCategory(
  auth: SellerContext,
  workspaceId: string,
  id: string,
  input: UpdateCategoryInput,
): Promise<Category> {
  type CategoryUpdate = Database["public"]["Tables"]["categories"]["Update"];
  const updatePayload: CategoryUpdate = {};

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) throw new ValidationError("Category name cannot be blank.");
    updatePayload.name = trimmed;
  }

  if (input.slug !== undefined) {
    updatePayload.slug = input.slug.trim().toLowerCase();
  }

  if (input.parentId !== undefined) {
    if (input.parentId === id) {
      throw new ValidationError("A category cannot be its own parent.");
    }
    if (input.parentId !== null) {
      const { data: parent, error: parentError } = await auth.db
        .from("categories")
        .select("id")
        .eq("id", input.parentId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (parentError) throw parentError;
      if (!parent) {
        throw new NotFoundError(`Parent category ${input.parentId} not found in this workspace.`);
      }
    }
    updatePayload.parent_id = input.parentId;
  }

  if (input.description !== undefined) {
    updatePayload.description = input.description;
  }

  if (input.channelMappings !== undefined) {
    updatePayload.channel_mappings = input.channelMappings as Json;
  }

  const { data, error } = await auth.db
    .from("categories")
    .update(updatePayload)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      throw new ConflictError("A category with this slug already exists in this workspace.");
    }
    throw error;
  }

  if (!data) {
    throw new NotFoundError(`Category ${id} not found.`);
  }

  return toCategory(data as unknown as CategoryRow);
}

export async function deleteCategory(
  auth: SellerContext,
  workspaceId: string,
  id: string,
): Promise<void> {
  const { error } = await auth.db
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) {
    throw error;
  }
}
