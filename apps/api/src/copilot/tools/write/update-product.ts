import { z } from "zod";

import type { SellerContext } from "../../../middleware/seller-context.js";

export const updateProductDetailsInputSchema = z.object({
  productId: z.string().describe("UUID of the product to update"),
  currentTitle: z.string().describe("Current title of the product for display"),
  newTitle: z.string().min(1).max(255).optional().describe("New title for the product"),
  newDescription: z.string().optional().describe("New description for the product"),
  newStatus: z
    .enum(["active", "draft", "archived"])
    .optional()
    .describe("New product status"),
  newTags: z.array(z.string()).optional().describe("Updated tags list (e.g. ['summer', 'lawn'])"),
  reason: z.string().optional().describe("Reason for updating product details"),
});

export type UpdateProductDetailsInput = z.infer<typeof updateProductDetailsInputSchema>;

/**
 * Write-Side AI Tool: Guarded Product Metadata Update (Title, Description, Status, Tags).
 *
 * Invariant: Changing product names, lifecycle status, or metadata requires explicit seller
 * approval via Human-in-the-Loop before committing.
 */
export function updateProductDetailsTool(auth: SellerContext) {
  return {
    description:
      "Update product information such as title/name, description, status (active/draft/archived), or tags. Requires seller approval via Human-in-the-Loop before executing.",
    inputSchema: updateProductDetailsInputSchema,
    execute: async ({
      productId,
      currentTitle,
      newTitle,
      newDescription,
      newStatus,
      newTags,
      reason,
    }: UpdateProductDetailsInput) => {
      const updatePayload: {
        title?: string;
        description?: string;
        status?: "active" | "draft" | "archived";
        tags?: string[];
      } = {};

      if (newTitle !== undefined) {
        updatePayload.title = newTitle;
      }
      if (newDescription !== undefined) {
        updatePayload.description = newDescription;
      }
      if (newStatus !== undefined) {
        updatePayload.status = newStatus;
      }
      if (newTags !== undefined) {
        updatePayload.tags = newTags;
      }

      if (Object.keys(updatePayload).length === 0) {
        return {
          status: "error",
          message: "No fields provided to update.",
          productId,
          currentTitle,
        };
      }

      const { data, error } = await auth.db
        .from("products")
        .update(updatePayload)
        .eq("id", productId)
        .select("id, title, status, tags, description")
        .single();

      if (error) {
        return {
          status: "error",
          message: `Failed to update product: ${error.message}`,
          productId,
          currentTitle,
        };
      }

      return {
        status: "success",
        message: `Successfully updated product "${data.title}" (status: ${data.status}).`,
        productId: data.id,
        title: data.title,
        productStatus: data.status,
        tags: data.tags,
        reason: reason ?? "Manual update via Copilot",
      };
    },
  };
}
