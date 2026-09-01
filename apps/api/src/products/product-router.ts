import {
  createProductInputSchema,
  productSearchQuerySchema,
  updateProductInputSchema,
} from "@pakcommerce/shared";
import { Router } from "express";
import type { ZodType } from "zod";

import { ValidationError } from "../lib/http-errors.js";
import { sellerContext } from "./seller-context.js";
import {
  archiveProduct,
  createProduct,
  getProduct,
  listProducts,
  updateProduct,
} from "./product-service.js";

/**
 * HTTP for products.
 *
 * This layer does three things and nothing else: parse the request against the
 * shared contract, call the service, shape the response. No business rules, no
 * database, no seller filtering - that all lives below.
 *
 * Every route is mounted behind `requireAuth`, so `sellerContext` cannot fail in
 * practice; it exists to fail loudly rather than run an unscoped query if
 * someone ever mounts this router without the middleware.
 */
export const productRouter = Router();

/** Parses against a contract schema, turning a Zod failure into a 400. */
function parseOrThrow<T>(schema: ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    // apiErrorDetailsSchema is Record<field, messages>, so several problems with
    // the same field collapse into one entry rather than a flat list the
    // dashboard would have to group itself.
    const details: Record<string, string[]> = {};

    for (const issue of result.error.issues) {
      const field = issue.path.join(".") || "_";
      (details[field] ??= []).push(issue.message);
    }

    throw new ValidationError(`Invalid ${what}.`, details);
  }

  return result.data;
}

/**
 * Query strings are all strings, and repeated/comma-separated values are
 * ambiguous, so they are normalised before the contract sees them. The contract
 * describes the domain shape; this maps HTTP's flat string world onto it.
 */
function normaliseSearchQuery(query: Record<string, unknown>): Record<string, unknown> {
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
    inventoryStates: list(query.inventoryStates),
    categoryIds: list(query.categoryIds),
    tags: list(query.tags),
    searchFields: list(query.searchFields),
    ...(query.sort === undefined ? {} : { sort: query.sort }),
    ...(query.limit === undefined ? {} : { limit: Number(query.limit) }),
    cursor: query.cursor,
  };
}

productRouter.post("/", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const input = parseOrThrow(createProductInputSchema, request.body, "product");

    response.status(201).json({ data: await createProduct(auth, input) });
  } catch (error) {
    next(error);
  }
});

productRouter.get("/", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const query = parseOrThrow(
      productSearchQuerySchema,
      normaliseSearchQuery(request.query as Record<string, unknown>),
      "search query",
    );

    const { items, meta, nextCursor } = await listProducts(auth, query);

    // `data` + `meta` is apiListResponseSchema. `nextCursor` is an extra
    // convenience for callers that would rather page forward than count.
    response.json({ data: items, meta, nextCursor });
  } catch (error) {
    next(error);
  }
});

productRouter.get("/:id", async (request, response, next) => {
  try {
    const auth = sellerContext(request);

    response.json({ data: await getProduct(auth, request.params.id) });
  } catch (error) {
    next(error);
  }
});

productRouter.patch("/:id", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const input = parseOrThrow(updateProductInputSchema, request.body, "product update");

    response.json({ data: await updateProduct(auth, request.params.id, input) });
  } catch (error) {
    next(error);
  }
});

/** Archives the product. See `archiveProduct` for why this is not a delete. */
productRouter.delete("/:id", async (request, response, next) => {
  try {
    const auth = sellerContext(request);

    response.json({ data: await archiveProduct(auth, request.params.id) });
  } catch (error) {
    next(error);
  }
});
