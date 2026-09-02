import { z } from "zod";

import type { SellerContext } from "../../../middleware/seller-context.js";

export const mutateDatabaseInputSchema = z.object({
  summary: z
    .string()
    .min(1)
    .max(500)
    .describe(
      "A clear, plain-English summary of the proposed database change so the merchant knows exactly what will happen before approving.",
    ),
  sql: z
    .string()
    .min(1)
    .max(4000)
    .describe(
      "A single UPDATE, INSERT, or DELETE SQL statement to execute. Must query or touch tables the seller owns (products, product_variants). Semicolons and DDL (DROP, ALTER) are forbidden. RLS automatically scopes all changes to the authenticated seller.",
    ),
  affectedTable: z
    .enum(["products", "product_variants", "workspaces"])
    .describe("The primary table affected by this mutation"),
  reason: z
    .string()
    .optional()
    .describe("Business reason or merchant instruction prompting this change"),
});

export type MutateDatabaseInput = z.infer<typeof mutateDatabaseInputSchema>;

export type MutateDatabaseResult =
  | {
      status: "error";
      message: string;
      summary: string;
      sql: string;
    }
  | {
      status: "success";
      message: string;
      summary: string;
      sql: string;
      rowsAffected: number;
      reason?: string;
    };

const FORBIDDEN_KEYWORDS =
  /\b(drop|alter|truncate|grant|revoke|create|replace|copy|vacuum|analyze|do|call|execute|comment|listen|notify|merge|upsert|pg_sleep)\b/i;

function preflightCheck(sql: string): string | null {
  const cleanSql = sql.trim().replace(/;+\s*$/, "");
  const normalized = cleanSql.toLowerCase();

  if (normalized === "") return "Empty query.";
  if (
    !normalized.startsWith("update") &&
    !normalized.startsWith("insert") &&
    !normalized.startsWith("delete")
  ) {
    return "Only UPDATE, INSERT, or DELETE mutation queries are allowed.";
  }
  if (cleanSql.includes(";")) {
    return "Only a single statement is allowed; semicolons are forbidden.";
  }
  if (FORBIDDEN_KEYWORDS.test(cleanSql)) {
    return "The query contains a forbidden DDL or system keyword.";
  }

  return null;
}

/**
 * Universal Write-Side AI Tool: Guarded SQL Mutation with Mandatory Human-in-the-Loop Approval.
 *
 * Invariant: All mutations require explicit merchant approval via Vercel AI SDK HITL mechanism.
 * The query is executed via `run_guarded_mutation` with SECURITY INVOKER, so Postgres RLS
 * policies guarantee a seller can NEVER modify or delete another seller's data.
 */
export function mutateDatabaseTool(auth: SellerContext) {
  return {
    description:
      "Execute a guarded UPDATE, INSERT, or DELETE statement against the seller's database (products, product_variants). Use this universal tool for ANY modification: updating product names, descriptions, prices, stock levels, tags, or statuses. Requires seller approval via Human-in-the-Loop before executing.",
    inputSchema: mutateDatabaseInputSchema,
    execute: async ({
      summary,
      sql,
      affectedTable,
      reason,
    }: MutateDatabaseInput): Promise<MutateDatabaseResult> => {
      const cleanSql = sql.trim().replace(/;+\s*$/, "");
      const problem = preflightCheck(cleanSql);

      if (problem) {
        return {
          status: "error",
          message: problem,
          summary,
          sql: cleanSql,
        };
      }

      const { data, error } = await auth.db.rpc("run_guarded_mutation", {
        p_sql: cleanSql,
      });

      if (error) {
        return {
          status: "error",
          message: `Database mutation rejected: ${error.message}`,
          summary,
          sql: cleanSql,
        };
      }

      const rowsAffected =
        typeof data === "object" && data !== null && "rows_affected" in data
          ? Number((data as { rows_affected: number }).rows_affected)
          : 1;

      return {
        status: "success",
        message: `Successfully executed: ${summary} (${rowsAffected} row(s) updated in ${affectedTable}).`,
        summary,
        sql: cleanSql,
        rowsAffected,
        reason,
      };
    },
  };
}
