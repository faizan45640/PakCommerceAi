import { z } from "zod";

import type { SellerContext } from "../../../middleware/seller-context.js";

/**
 * Read-Side AI Tool: Natural Language to Safe Read-Only Database Query.
 *
 * The safety net for questions no structured tool anticipates. The LLM writes
 * the SQL; the database decides whether it is allowed. This file does not
 * connect to Postgres directly - it calls `run_readonly_query` through the
 * Supabase API (`.rpc()`), which means:
 *
 * - The query executes as the seller (SECURITY INVOKER), so RLS still applies:
 *   a seller can only ever read their own rows, no matter what the SQL says.
 * - The database rejects anything that is not a single SELECT/WITH, rejects
 *   semicolons, forbids mutating keywords, and caps the run at 10s / 200 rows.
 *
 * The string check here is a fast pre-flight for clearer errors; the database
 * is the actual authority. Never weaken the function in the migration.
 */

export const queryDatabaseInputSchema = z.object({
  queryDescription: z
    .string()
    .min(1)
    .max(300)
    .describe(
      "Plain English explanation of what business data is being retrieved, so the result can be explained to the seller.",
    ),
  sql: z
    .string()
    .min(1)
    .max(4000)
    .describe(
      "A single read-only Postgres SELECT (or WITH ... SELECT) statement. No semicolons, no INSERT/UPDATE/DELETE/DROP/ALTER. Query tables the seller owns: products, product_variants, workspaces, seller_profiles, product_list_view. RLS scopes results to the seller, so never add a seller_id filter.",
    ),
});

export type QueryDatabaseInput = z.input<typeof queryDatabaseInputSchema>;

export type QueryDatabaseResult =
  | { status: "error"; message: string; queryDescription: string; sql?: string }
  | {
      status: "success";
      queryDescription: string;
      rowCount: number;
      rows: unknown[];
      note?: string;
    };

/** Pre-flight mirror of the database checks, so bad SQL fails with a clear tool error instead of a database error. */
const FORBIDDEN_KEYWORDS =
  /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|replace|copy|vacuum|analyze|set|reset|do|call|execute|comment|listen|notify|merge|upsert)\b/i;

function preflightCheck(sql: string): string | null {
  // Trim all whitespace, not just spaces: SQL built in template literals (and
  // by the model) routinely starts with a newline, which would fail the
  // startsWith checks below.
  const normalized = sql.trim().replace(/^\s+/, "").toLowerCase();

  if (normalized === "") return "Empty query.";
  if (!normalized.startsWith("select") && !normalized.startsWith("with")) {
    return "Only SELECT or WITH queries are allowed.";
  }
  if (sql.includes(";")) {
    return "Only a single statement is allowed; the query must not contain semicolons.";
  }
  if (FORBIDDEN_KEYWORDS.test(sql)) {
    return "The query contains a forbidden keyword (mutations and DDL are not allowed).";
  }

  return null;
}

export function queryDatabaseTool(auth: SellerContext) {
  return {
    description:
      "Execute a safe, read-only analytical SQL query against the seller's own database (products, product_variants, workspaces) to answer business questions that no other tool covers. RLS scopes every result to the seller. Only SELECT is allowed; the database enforces it.",
    inputSchema: queryDatabaseInputSchema,
    execute: async ({ queryDescription, sql }: QueryDatabaseInput): Promise<QueryDatabaseResult> => {
      const problem = preflightCheck(sql);

      if (problem) {
        return {
          status: "error",
          message: problem,
          queryDescription,
        };
      }

      const { data, error } = await auth.db.rpc("run_readonly_query", {
        p_sql: sql,
      });

      if (error) {
        return {
          status: "error",
          message: `The database rejected the query: ${error.message}`,
          queryDescription,
          sql,
        };
      }

      const rows = Array.isArray(data) ? data : [];

      return {
        status: "success",
        queryDescription,
        rowCount: rows.length,
        rows,
        note: rows.length === 200 ? "Result capped at 200 rows." : undefined,
      };
    },
  };
}
