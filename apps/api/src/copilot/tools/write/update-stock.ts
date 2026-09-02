import { z } from "zod";

import type { SellerContext } from "../../../middleware/seller-context.js";

export const updateProductStockInputSchema = z.object({
  variantId: z.string().describe("UUID of the product variant to update"),
  productTitle: z.string().describe("Name or title of the product for confirmation display"),
  newQuantity: z.number().int().nonnegative().describe("New stock quantity on hand"),
  reason: z.string().optional().describe("Reason for manual stock adjustment"),
});

export type UpdateProductStockInput = z.infer<typeof updateProductStockInputSchema>;

/**
 * Write-Side AI Tool: Guarded Inventory Stock Level Update.
 *
 * Invariant: Sensitive mutation actions require explicit seller authorization/confirmation.
 * When toolApproval is enabled in streamText, the Vercel AI SDK halts execution,
 * requests approval from the merchant via the UI stream, and calls execute() only
 * after human approval.
 */
export function updateProductStockTool(auth: SellerContext) {
  return {
    description:
      "Update the quantity on hand for a specific product variant in the seller's inventory. Requires seller approval via Human-in-the-Loop before executing.",
    inputSchema: updateProductStockInputSchema,
    execute: async ({
      variantId,
      productTitle,
      newQuantity,
      reason,
    }: UpdateProductStockInput) => {
      // Updates product_variants directly via auth.db. Postgres RLS ensures tenant isolation.
      const { data, error } = await auth.db
        .from("product_variants")
        .update({ quantity_on_hand: newQuantity })
        .eq("id", variantId)
        .select("id, product_id, title, quantity_on_hand, inventory_state")
        .single();

      if (error) {
        return {
          status: "error",
          message: `Failed to update stock: ${error.message}`,
          variantId,
          productTitle,
        };
      }

      return {
        status: "success",
        message: `Successfully updated stock for "${productTitle || data.title}" to ${data.quantity_on_hand} units.`,
        variantId: data.id,
        productId: data.product_id,
        quantityOnHand: data.quantity_on_hand,
        inventoryState: data.inventory_state,
        reason: reason ?? "Manual adjustment via Copilot",
      };
    },
  };
}

