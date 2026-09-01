import type { SellerContext } from "../products/seller-context.js";
import { getCourierPerformanceTool } from "./read/courier-performance.js";
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
 */
export function createCopilotTools(auth: SellerContext) {
  return {
    // Read side (Analytics & Queries)
    searchProducts: searchProductsTool(auth),
    queryDatabase: queryDatabaseTool(auth),
    getCourierPerformance: getCourierPerformanceTool,

    // Write side (Guarded Mutations)
    updateProductStock: updateProductStockTool,
  };
}

export type CopilotTools = ReturnType<typeof createCopilotTools>;
