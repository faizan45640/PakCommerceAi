import { z } from "zod";

import type { SellerContext } from "../../../middleware/seller-context.js";

export const updateProductPriceInputSchema = z.object({
  variantId: z.string().describe("UUID of the product variant whose price is being updated"),
  productTitle: z.string().describe("Product name for display and confirmation"),
  variantTitle: z.string().optional().describe("Variant title or SKU for confirmation display"),
  newPricePkr: z
    .number()
    .positive()
    .describe("New selling price in Pakistani Rupees (PKR), e.g. 4200 for Rs. 4,200"),
  compareAtPricePkr: z
    .number()
    .positive()
    .optional()
    .describe("Optional strike-through / original price in PKR for sale discounts"),
  reason: z.string().optional().describe("Reason for price adjustment"),
});

export type UpdateProductPriceInput = z.infer<typeof updateProductPriceInputSchema>;

/**
 * Write-Side AI Tool: Guarded Product Variant Price Update.
 *
 * Invariant: Price mutations directly impact revenue and require explicit seller approval
 * via Vercel AI SDK Human-in-the-Loop approval mechanism before commit.
 */
export function updateProductPriceTool(auth: SellerContext) {
  return {
    description:
      "Update the regular selling price (and optional compare-at price) for a product variant. Requires seller approval via Human-in-the-Loop before executing.",
    inputSchema: updateProductPriceInputSchema,
    execute: async ({
      variantId,
      productTitle,
      variantTitle,
      newPricePkr,
      compareAtPricePkr,
      reason,
    }: UpdateProductPriceInput) => {
      const priceAmountMinor = Math.round(newPricePkr * 100);
      const updatePayload: {
        price_amount_minor: number;
        price_currency: string;
        compare_at_price_amount_minor?: number;
        compare_at_price_currency?: string;
      } = {
        price_amount_minor: priceAmountMinor,
        price_currency: "PKR",
      };

      if (compareAtPricePkr !== undefined) {
        updatePayload.compare_at_price_amount_minor = Math.round(compareAtPricePkr * 100);
        updatePayload.compare_at_price_currency = "PKR";
      }

      const { data, error } = await auth.db
        .from("product_variants")
        .update(updatePayload)
        .eq("id", variantId)
        .select("id, product_id, title, price_amount_minor, price_currency, compare_at_price_amount_minor")
        .single();

      if (error) {
        return {
          status: "error",
          message: `Failed to update price: ${error.message}`,
          variantId,
          productTitle,
        };
      }

      const updatedPricePkr = (data.price_amount_minor / 100).toLocaleString("en-PK");
      const displayVariant = data.title || variantTitle;
      return {
        status: "success",
        message: `Successfully updated price for "${productTitle}${displayVariant ? ` (${displayVariant})` : ""}" to Rs. ${updatedPricePkr}.`,
        variantId: data.id,
        productId: data.product_id,
        variantTitle: displayVariant,
        newPricePkr,
        compareAtPricePkr,
        reason: reason ?? "Manual price update via Copilot",
      };
    },
  };
}
