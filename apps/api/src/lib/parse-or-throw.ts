import type { ZodType } from "zod";

import { ValidationError } from "./http-errors.js";

/** Parses against a contract schema, turning a Zod failure into a 400. */
export function parseOrThrow<T>(schema: ZodType<T>, value: unknown, what: string): T {
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
