import { createCategorySchema, updateCategorySchema } from "@pakcommerce/shared";
import { Router } from "express";
import type { ZodType } from "zod";

import { ValidationError } from "../lib/http-errors.js";
import { sellerContext } from "../products/seller-context.js";
import { getCurrentWorkspace } from "../workspaces/workspace-service.js";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "./category-service.js";

export const categoryRouter = Router({ mergeParams: true });

function parseOrThrow<T>(schema: ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    const details: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const field = issue.path.join(".") || "_";
      (details[field] ??= []).push(issue.message);
    }
    throw new ValidationError(`Invalid ${what}.`, details);
  }

  return result.data;
}

async function resolveWorkspaceId(
  auth: ReturnType<typeof sellerContext>,
  request: import("express").Request,
): Promise<string> {
  const paramId = request.params.workspaceId;
  const queryId = request.query.workspaceId;
  const headerId = request.headers["x-workspace-id"];

  const candidate = (paramId || queryId || headerId) as string | undefined;
  if (candidate && typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }

  const current = await getCurrentWorkspace(auth);
  return current.id;
}

categoryRouter.get("/", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const workspaceId = await resolveWorkspaceId(auth, request);
    const categories = await listCategories(auth, workspaceId);

    response.json({ data: categories });
  } catch (error) {
    next(error);
  }
});

categoryRouter.post("/", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const workspaceId = await resolveWorkspaceId(auth, request);
    const input = parseOrThrow(createCategorySchema, request.body, "category");

    const category = await createCategory(auth, workspaceId, input);
    response.status(201).json({ data: category });
  } catch (error) {
    next(error);
  }
});

categoryRouter.patch("/:id", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const workspaceId = await resolveWorkspaceId(auth, request);
    const input = parseOrThrow(updateCategorySchema, request.body, "category");

    const category = await updateCategory(auth, workspaceId, request.params.id, input);
    response.json({ data: category });
  } catch (error) {
    next(error);
  }
});

categoryRouter.delete("/:id", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const workspaceId = await resolveWorkspaceId(auth, request);

    await deleteCategory(auth, workspaceId, request.params.id);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});
