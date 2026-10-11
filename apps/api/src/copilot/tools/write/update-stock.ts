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
 * Uses the database function `adjust_stock` so that every stock modification
 * is performed under an exclusive variant lock and records an append-only
 * audit trail in `stock_movements`.
 */
export function updateProductStockTool(auth: SellerContext) {
  return {
    description:
      "Update the quantity on hand for a specific product variant in the seller's inventory. Requires seller approval via Human-in-the-Loop before executing.",
    inputSchema: updateProductStockInputSchema,
    needsApproval: true,
    execute: async ({
      variantId,
      productTitle,
      newQuantity,
      reason,
    }: UpdateProductStockInput) => {
      // 1. Resolve variant to obtain workspace_id and verify seller ownership under RLS.
      const { data: variant, error: fetchError } = await auth.db
        .from("product_variants")
        .select("id, product_id, workspace_id, title")
        .eq("id", variantId)
        .single();

      if (fetchError || !variant) {
        return {
          status: "error",
          message: `Failed to find product variant: ${fetchError?.message ?? "Variant not found"}`,
          variantId,
          productTitle,
        };
      }

      // 2. Perform atomic stock adjustment via the adjust_stock RPC function.
      const { data: movementId, error: rpcError } = await auth.db.rpc("adjust_stock", {
        p_workspace_id: variant.workspace_id,
        p_variant_id: variant.id,
        p_target_quantity: newQuantity,
        p_reason: "manual_adjustment",
        p_note: reason ?? "Manual adjustment via Copilot",
      });

      if (rpcError) {
        return {
          status: "error",
          message: `Failed to update stock: ${rpcError.message}`,
          variantId,
          productTitle,
        };
      }

      // 3. Read back updated variant state.
      const { data: updated } = await auth.db
        .from("product_variants")
        .select("quantity_on_hand, inventory_state")
        .eq("id", variantId)
        .single();

      const finalQuantity = updated?.quantity_on_hand ?? newQuantity;
      const finalState =
        updated?.inventory_state ?? (finalQuantity === 0 ? "out_of_stock" : "in_stock");

      return {
        status: "success",
        message: `Stock for "${productTitle || variant.title}" is now ${finalQuantity} pieces.`,
        variantId: variant.id,
        productId: variant.product_id,
        quantityOnHand: finalQuantity,
        inventoryState: finalState,
        movementId: movementId ?? undefined,
        reason: reason ?? "Manual adjustment via Copilot",
      };
    },
  };
}

