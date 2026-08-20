import { z } from "zod";

/**
 * Write-Side AI Tool: Guarded Inventory Stock Level Update.
 *
 * Invariant: Sensitive mutation actions require explicit seller authorization/confirmation.
 */
export const updateProductStockTool = {
  description:
    "Update the quantity on hand for a specific product variant. Returns an action confirmation request for the seller before mutating database state.",
  inputSchema: z.object({
    variantId: z.string().describe("UUID of the product variant to update"),
    productTitle: z.string().describe("Name/title of the product"),
    newQuantity: z.number().int().nonnegative().describe("New stock quantity on hand"),
    reason: z.string().optional().describe("Reason for manual stock adjustment"),
  }),
  execute: async ({
    variantId,
    productTitle,
    newQuantity,
    reason,
  }: {
    variantId: string;
    productTitle: string;
    newQuantity: number;
    reason?: string;
  }) => {
    // Scaffolded response returning a structured action card for Human-in-the-Loop confirmation
    return {
      status: "pending_confirmation",
      actionType: "inventory_adjustment",
      payload: {
        variantId,
        productTitle,
        newQuantity,
        reason: reason ?? "Manual adjustment via Copilot",
      },
      message: `Please confirm updating stock for "${productTitle}" to ${newQuantity} units.`,
    };
  },
};
