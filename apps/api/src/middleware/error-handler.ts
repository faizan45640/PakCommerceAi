import type { NextFunction, Request, Response } from "express";

import { HttpError } from "../lib/http-errors.js";

/**
 * The single place an error becomes a response.
 *
 * Every error gets the same JSON shape, so the dashboard can handle failures
 * generically instead of guessing per endpoint:
 *
 *     { "error": { "code": "validation_error", "message": "...", "details": { ... } } }

 * The shape is `apiErrorSchema` from @pakcommerce/shared, so apps/web can parse
 * any failure from this API with the same schema.
 *
 * Anything that is not an `HttpError` is a bug, not an expected outcome, so it
 * becomes a 500 with a generic message. The real message is logged server-side
 * and never sent: database errors quote table names, constraint names and
 * sometimes the offending values, which is free reconnaissance for anyone
 * probing the API.
 *
 * Must be registered last, and must keep four parameters - Express identifies
 * error handlers by arity, and dropping the unused `next` silently turns this
 * into ordinary middleware that never runs.
 */
export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
): void {
  if (error instanceof HttpError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    });
    return;
  }

  console.error("Unhandled error:", error);

  response.status(500).json({
    error: {
      code: "internal_error",
      message: "Something went wrong.",
    },
  });
}
