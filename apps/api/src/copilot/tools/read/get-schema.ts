import { z } from "zod";

import type { SellerContext } from "../../../middleware/seller-context.js";
import { QUERYABLE_TABLES } from "../../schema-document.js";

/**
 * Read-Side AI Tool: introspect the seller's schema at runtime.
 *
 * The system prompt carries a static schema document, but schemas grow and the
 * model should be able to confirm what actually exists before writing SQL. This
 * tool runs a fixed, safe introspection query through the same read-only RPC as
 * queryDatabase — the query string is a constant here, never model-authored, so
 * there is nothing to inject.
 *
 * It is deliberately narrow: only the tables the project owns (public schema,
 * from QUERYABLE_TABLES). information_schema would leak nothing the seller
 * cannot already see, but scoping to the owned tables keeps the answer small
 * and focused on what the copilot can actually query.
 */

export const getSchemaInputSchema = z.object({
  table: z
    .enum(QUERYABLE_TABLES)
    .optional()
    .describe(
      "Optional table name to describe. Omit to list all queryable tables with their columns.",
    ),
});

export type GetSchemaInput = z.input<typeof getSchemaInputSchema>;

export type GetSchemaResult =
  | { status: "error"; message: string }
  | { status: "success"; tables: unknown[] };

/**
 * Column facts for one owned table. information_schema is RLS-aware in the
 * sense that it only reports tables the caller has privileges on; the read-only
 * RPC runs as the seller, so this returns exactly what the seller could query.
 * Exported for tests; the model never sees or controls this string.
 */
export const SCHEMA_QUERY = (table?: string) => `
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  ${table ? "and table_name = '" + table + "'" : ""}
order by table_name, ordinal_position`;

export function getSchemaTool(auth: SellerContext) {
  return {
    description:
      "List the database tables and their columns (names and types) that the seller can query, so you can write correct SQL. Call this before queryDatabase when you are unsure a column or table exists.",
    inputSchema: getSchemaInputSchema,
    execute: async ({ table }: GetSchemaInput): Promise<GetSchemaResult> => {
      // Defence in depth: the SDK validates model calls against inputSchema, but
      // execute is also reachable directly, so parse again here and refuse
      // anything outside the owned tables rather than building SQL from it.
      const parsed = getSchemaInputSchema.safeParse({ table });
      if (!parsed.success) {
        return {
          status: "error",
          message: "Unknown table. Only the seller's own tables are queryable.",
        };
      }

      const { data, error } = await auth.db.rpc("run_readonly_query", {
        p_sql: SCHEMA_QUERY(parsed.data.table),
      });

      if (error) {
        return {
          status: "error",
          message: `Could not read the schema: ${error.message}`,
        };
      }

      const rows = Array.isArray(data) ? data : [];

      return { status: "success", tables: rows };
    },
  };
}
