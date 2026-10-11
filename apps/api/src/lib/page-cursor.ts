import { ValidationError } from "./http-errors.js";

/**
 * Two shared contracts disagree about pagination, so list endpoints satisfy both.
 *
 * The search query schemas (domain) are cursor-based: `cursor` and `limit`.
 * `apiListResponseSchema` (transport) requires `meta: { page, pageSize, total }`.
 *
 * The cursor therefore carries a page number: callers can keep passing the
 * opaque `nextCursor` they were given, and the response still reports the
 * page/pageSize/total the envelope demands. It stays opaque so it can become
 * keyset pagination later without a contract change.
 *
 * Raised with the team rather than silently picked - see docs/api.md.
 */
export function decodePageCursor(cursor: string | undefined): number {
  if (!cursor) return 1;

  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const page = Number(decoded?.page);

    if (!Number.isInteger(page) || page < 1) throw new Error("bad page");
    return page;
  } catch {
    throw new ValidationError("Invalid cursor.", { cursor: ["Cursor is not valid."] });
  }
}

export function encodePageCursor(page: number): string {
  return Buffer.from(JSON.stringify({ page }), "utf8").toString("base64url");
}
