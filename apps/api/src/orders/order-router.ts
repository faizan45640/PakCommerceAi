import {
  createDraftOrderInputSchema,
  orderSearchQuerySchema,
  transitionOrderStatusInputSchema,
} from "@pakcommerce/shared";
import { Router } from "express";

import { parseOrThrow } from "../lib/parse-or-throw.js";
import { sellerContext } from "../middleware/seller-context.js";
import {
  createDraftOrder,
  getOrderDetail,
  listOrders,
  transitionOrderStatus,
} from "./order-service.js";

/**
 * HTTP for draft/manual orders and draft→confirmed|cancelled transitions.
 *
 * Confirmation runs `transition_order_status`, which deducts stock with a
 * `sale` movement in the same database transaction as the status change.
 */
export const orderRouter = Router();

function normaliseOrderQuery(query: Record<string, unknown>): Record<string, unknown> {
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
    statuses: list(query.statuses),
    channels: list(query.channels),
    sort: query.sort,
    ...(query.limit === undefined ? {} : { limit: Number(query.limit) }),
    cursor: query.cursor,
  };
}

orderRouter.post("/", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const input = parseOrThrow(
      createDraftOrderInputSchema,
      request.body,
      "draft order",
    );

    response.status(201).json({ data: await createDraftOrder(auth, input) });
  } catch (error) {
    next(error);
  }
});

orderRouter.get("/", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const query = parseOrThrow(
      orderSearchQuerySchema,
      normaliseOrderQuery(request.query as Record<string, unknown>),
      "order query",
    );

    const { items, meta, nextCursor } = await listOrders(auth, query);

    response.json({ data: items, meta, nextCursor });
  } catch (error) {
    next(error);
  }
});

orderRouter.get("/:orderId", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const workspaceId = String(request.query.workspaceId ?? "");
    if (!workspaceId) {
      response.status(400).json({
        error: {
          code: "validation_error",
          message: "workspaceId is required.",
          details: { workspaceId: ["workspaceId is required."] },
        },
      });
      return;
    }

    response.json({
      data: await getOrderDetail(auth, workspaceId, request.params.orderId),
    });
  } catch (error) {
    next(error);
  }
});

orderRouter.post("/:orderId/transition", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const input = parseOrThrow(
      transitionOrderStatusInputSchema,
      {
        ...request.body,
        orderId: request.params.orderId,
      },
      "order transition",
    );

    response.json({
      data: await transitionOrderStatus(
        auth,
        input.workspaceId,
        input.orderId,
        input.toStatus,
        input.note,
      ),
    });
  } catch (error) {
    next(error);
  }
});
