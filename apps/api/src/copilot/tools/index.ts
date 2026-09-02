import type { SellerContext } from "../../middleware/seller-context.js";
import { getCourierPerformanceTool } from "./read/courier-performance.js";
import { getSchemaTool } from "./read/get-schema.js";
import { queryDatabaseTool } from "./read/query-database.js";
import { searchProductsTool } from "./read/search-products.js";
import { updateProductStockTool } from "./write/update-stock.js";

/**
 * Central Copilot Tool Registry.
 *
 * CQRS Architecture:
 * - Read-Side Tools: Safe, read-only analytics & database querying
 * - Write-Side Tools: Guarded domain actions requiring seller confirmation / approval
 *
 * Tools are built per-request via `createCopilotTools(auth)`, never at module
 * load. The read tools query the seller's data through a request-scoped
 * Supabase client, so RLS does the tenant isolation exactly as it does for the
 * REST API - a module-level tool would have no seller to act as.
 *
 * Tool discipline (Vercel's "remove 80% of the tools" finding): searchProducts
 * is the structured first choice for anything about the catalogue; getSchema is
 * how the model confirms what exists before writing SQL; queryDatabase is the
 * last resort for questions no structured tool covers. The system prompt steers
 * that ordering, not the registry.
 */
export function createCopilotTools(auth: SellerContext) {
  return {
    // Read side (Analytics & Queries)
    searchProducts: searchProductsTool(auth),
    getSchema: getSchemaTool(auth),
    queryDatabase: queryDatabaseTool(auth),
    getCourierPerformance: getCourierPerformanceTool,

    // Write side (Guarded Mutations)
    updateProductStock: updateProductStockTool(auth),
  };
}

export type CopilotTools = ReturnType<typeof createCopilotTools>;
