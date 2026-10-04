import type { Workspace, WorkspaceListItem } from "@pakcommerce/shared";

import { NotFoundError } from "../lib/http-errors.js";
import type { SellerContext } from "../products/seller-context.js";

export async function getCurrentWorkspace(auth: SellerContext): Promise<Workspace> {
  const { data, error } = await auth.db
    .from("workspaces")
    .select("*")
    .eq("seller_id", auth.sellerId)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    throw new NotFoundError("No active workspace found for this seller.");
  }

  return {
    id: data.id,
    sellerId: data.seller_id,
    name: data.name,
    slug: data.slug,
    status: data.status,
    isDefault: data.is_default,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    archivedAt: data.archived_at ?? null,
  };
}

export async function listWorkspaces(auth: SellerContext): Promise<WorkspaceListItem[]> {
  const { data, error } = await auth.db
    .from("workspaces")
    .select("id, seller_id, name, slug, status, is_default, updated_at")
    .eq("seller_id", auth.sellerId)
    .order("is_default", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    sellerId: row.seller_id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    isDefault: row.is_default,
    updatedAt: row.updated_at,
  }));
}
