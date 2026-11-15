import {
  conversationSearchQuerySchema,
  messageListQuerySchema,
} from "@pakcommerce/shared/conversations";
import { Router } from "express";
import { z } from "zod";

import { NotFoundError } from "../lib/http-errors.js";
import { parseOrThrow } from "../lib/parse-or-throw.js";
import { sellerContext } from "../middleware/seller-context.js";
import {
  getConversation,
  listConversations,
  listMessages,
  markConversationRead,
} from "./conversation-service.js";
import { isMockInboundEnabled, ingestMockInbound, mockInboundBodySchema } from "./mock-inbound.js";

/**
 * HTTP for the WhatsApp inbox: list, thread, messages, mark read, and the mock
 * inbound endpoint. Conversations are created by inbound ingestion only.
 */
export const conversationRouter = Router();

const idSchema = z.uuid();
const workspaceQuerySchema = z.object({ workspaceId: z.uuid() });

function normaliseConversationQuery(query: Record<string, unknown>): Record<string, unknown> {
  const states =
    query.states === undefined
      ? undefined
      : (Array.isArray(query.states) ? query.states.map(String) : String(query.states).split(","))
          .map((entry) => entry.trim())
          .filter(Boolean);

  return {
    workspaceId: query.workspaceId,
    query: query.query,
    states,
    // Query strings are text: only "true" turns the filter on.
    ...(query.unreadOnly === undefined ? {} : { unreadOnly: query.unreadOnly === "true" }),
    ...(query.limit === undefined ? {} : { limit: Number(query.limit) }),
    cursor: query.cursor,
  };
}

conversationRouter.get("/", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const query = parseOrThrow(
      conversationSearchQuerySchema,
      normaliseConversationQuery(request.query as Record<string, unknown>),
      "conversation query",
    );

    const { items, meta, nextCursor } = await listConversations(auth, query);

    response.json({ data: items, meta, nextCursor });
  } catch (error) {
    next(error);
  }
});

/** Registered before `/:id` routes; POST-only so it never shadows a read. */
conversationRouter.post("/mock-inbound", async (request, response, next) => {
  try {
    if (!isMockInboundEnabled()) throw new NotFoundError("Unknown API endpoint.");

    const auth = sellerContext(request);
    const body = parseOrThrow(mockInboundBodySchema, request.body, "mock inbound message");

    const result = await ingestMockInbound(auth, body);

    response.status(result.duplicate ? 200 : 201).json({ data: result });
  } catch (error) {
    next(error);
  }
});

conversationRouter.get("/:id", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const id = parseOrThrow(idSchema, request.params.id, "conversation id");
    const { workspaceId } = parseOrThrow(workspaceQuerySchema, request.query, "conversation query");

    response.json({ data: await getConversation(auth, workspaceId, id) });
  } catch (error) {
    next(error);
  }
});

conversationRouter.get("/:id/messages", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const id = parseOrThrow(idSchema, request.params.id, "conversation id");
    const query = parseOrThrow(
      messageListQuerySchema,
      {
        workspaceId: request.query.workspaceId,
        ...(request.query.limit === undefined ? {} : { limit: Number(request.query.limit) }),
        cursor: request.query.cursor,
      },
      "message query",
    );

    const { items, meta, nextCursor } = await listMessages(auth, id, query);

    response.json({ data: items, meta, nextCursor });
  } catch (error) {
    next(error);
  }
});

conversationRouter.post("/:id/read", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const id = parseOrThrow(idSchema, request.params.id, "conversation id");
    const { workspaceId } = parseOrThrow(workspaceQuerySchema, request.query, "conversation query");

    response.json({ data: await markConversationRead(auth, workspaceId, id) });
  } catch (error) {
    next(error);
  }
});
