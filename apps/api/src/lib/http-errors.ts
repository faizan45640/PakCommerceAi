import type { ApiErrorCode, ApiErrorDetails } from "@pakcommerce/shared";

/**
 * Typed errors that carry an HTTP status.
 *
 * Handlers throw these; one error-handling middleware turns them into responses.
 * That keeps status codes out of the business logic and gives every error the
 * same JSON shape.
 *
 * The codes are not invented here - they come from `apiErrorCodeSchema` in
 * `@pakcommerce/shared`, so `apps/api` (producer) and `apps/web` (consumer)
 * cannot drift apart on what an error looks like.
 */

export class HttpError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  /** Field name to messages, per `apiErrorDetailsSchema`. */
  readonly details?: ApiErrorDetails;

  constructor(status: number, code: ApiErrorCode, message: string, details?: ApiErrorDetails) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** The request body or query did not match its contract. */
export class ValidationError extends HttpError {
  constructor(message: string, details?: ApiErrorDetails) {
    super(400, "validation_error", message, details);
  }
}

/** No usable credentials. Distinct from "you may not have this". */
export class UnauthorizedError extends HttpError {
  constructor(message = "Authentication required.") {
    super(401, "unauthorized", message);
  }
}

/**
 * The resource does not exist **for this seller**.
 *
 * Deliberately used where another system might return 403. RLS makes another
 * seller's rows invisible rather than forbidden, and answering "forbidden" would
 * confirm the id exists - which is exactly what someone probing ids wants to
 * learn. Absent and not-yours are reported identically.
 */
export class NotFoundError extends HttpError {
  constructor(message = "Not found.") {
    super(404, "not_found", message);
  }
}

/** The request collides with something already stored. */
export class ConflictError extends HttpError {
  constructor(message: string, details?: ApiErrorDetails) {
    super(409, "conflict", message, details);
  }
}
