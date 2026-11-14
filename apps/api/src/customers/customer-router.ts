import {
  createCustomerNoteInputSchema,
  customerSearchQuerySchema,
} from "@pakcommerce/shared";
import { Router } from "express";
import { z } from "zod";

import { parseOrThrow } from "../lib/parse-or-throw.js";
import { sellerContext } from "../middleware/seller-context.js";
import {
  createCustomerNote,
  deleteCustomerNote,
  getCustomerDetail,
  listCustomers,
} from "./customer-service.js";

/**
 * HTTP for Customer 360: list/search, profile, and notes.
 *
 * Customers are created by the database when an order is placed, so there is no
 * POST /customers.
 */
export const customerRouter = Router();

const idSchema = z.uuid();
const workspaceQuerySchema = z.object({ workspaceId: z.uuid() });

function normaliseCustomerQuery(query: Record<string, unknown>): Record<string, unknown> {
  const list = (value: unknown): string[] | undefined => {
    if (value === undefined) return undefined;
    if (Array.isArray(value)) return value.map(String);
    return String(value)
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  };

  return {
    workspaceId: query.workspaceId,
    query: query.query,
    phone: query.phone,
    tags: list(query.tags),
    sort: query.sort,
    ...(query.limit === undefined ? {} : { limit: Number(query.limit) }),
    cursor: query.cursor,
  };
}

customerRouter.get("/", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const query = parseOrThrow(
      customerSearchQuerySchema,
      normaliseCustomerQuery(request.query as Record<string, unknown>),
      "customer query",
    );

    const { items, meta, nextCursor } = await listCustomers(auth, query);

    response.json({ data: items, meta, nextCursor });
  } catch (error) {
    next(error);
  }
});

customerRouter.get("/:customerId", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const customerId = parseOrThrow(idSchema, request.params.customerId, "customer id");
    const { workspaceId } = parseOrThrow(
      workspaceQuerySchema,
      request.query,
      "customer query",
    );

    response.json({ data: await getCustomerDetail(auth, workspaceId, customerId) });
  } catch (error) {
    next(error);
  }
});

customerRouter.post("/:customerId/notes", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const customerId = parseOrThrow(idSchema, request.params.customerId, "customer id");
    const input = parseOrThrow(createCustomerNoteInputSchema, request.body, "customer note");

    response.status(201).json({ data: await createCustomerNote(auth, customerId, input) });
  } catch (error) {
    next(error);
  }
});

customerRouter.delete("/:customerId/notes/:noteId", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const customerId = parseOrThrow(idSchema, request.params.customerId, "customer id");
    const noteId = parseOrThrow(idSchema, request.params.noteId, "note id");
    const { workspaceId } = parseOrThrow(
      workspaceQuerySchema,
      request.query,
      "customer query",
    );

    await deleteCustomerNote(auth, workspaceId, customerId, noteId);

    response.status(204).end();
  } catch (error) {
    next(error);
  }
});
