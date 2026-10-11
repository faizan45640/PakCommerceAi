import { adjustStockInputSchema, stockMovementSearchQuerySchema } from "@pakcommerce/shared";
import { Router } from "express";

import { parseOrThrow } from "../lib/parse-or-throw.js";
import { sellerContext } from "../middleware/seller-context.js";
import { adjustStock, listStockMovements } from "./inventory-service.js";

/**
 * HTTP for stock adjustments and their history.
 *
 * Same three jobs as the product router and nothing else: parse the request
 * against the shared contract, call the service, shape the response.
 *
 * Mounted behind `requireAuth`, so `sellerContext` cannot fail in practice.
 */
export const inventoryRouter = Router();

/** Maps HTTP's flat string query onto the contract's shape. */
function normaliseMovementQuery(query: Record<string, unknown>): Record<string, unknown> {
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
    variantId: query.variantId,
    reasons: list(query.reasons),
    ...(query.limit === undefined ? {} : { limit: Number(query.limit) }),
    cursor: query.cursor,
  };
}

/**
 * Sets a variant's stock to a new total and records why.
 *
 * A POST to a collection of adjustments rather than a PATCH on the variant,
 * because each call creates something permanent: a movement in the history.
 */
inventoryRouter.post("/adjustments", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const input = parseOrThrow(adjustStockInputSchema, request.body, "stock adjustment");

    response.status(201).json({ data: await adjustStock(auth, input) });
  } catch (error) {
    next(error);
  }
});

inventoryRouter.get("/movements", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const query = parseOrThrow(
      stockMovementSearchQuerySchema,
      normaliseMovementQuery(request.query as Record<string, unknown>),
      "movement query",
    );

    const { items, meta, nextCursor } = await listStockMovements(auth, query);

    response.json({ data: items, meta, nextCursor });
  } catch (error) {
    next(error);
  }
});
