/**
 * Escapes a value for use inside a double-quoted PostgREST filter value, so
 * commas, periods and quotes in a search term cannot break or rewrite an
 * `.or()` predicate.
 */
export function escapePostgrestFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
