import { getCourierPerformanceTool } from "./read/courier-performance.js";
import { queryDatabaseTool } from "./read/query-database.js";
import { updateProductStockTool } from "./write/update-stock.js";

/**
 * Central Copilot Tool Registry.
 *
 * CQRS Architecture:
 * - Read-Side Tools: Safe, read-only analytics & database querying
 * - Write-Side Tools: Guarded domain actions requiring seller confirmation / approval
 */
export const copilotTools = {
  // Read side (Analytics & Queries)
  queryDatabase: queryDatabaseTool,
  getCourierPerformance: getCourierPerformanceTool,

  // Write side (Guarded Mutations)
  updateProductStock: updateProductStockTool,
};

export type CopilotTools = typeof copilotTools;
