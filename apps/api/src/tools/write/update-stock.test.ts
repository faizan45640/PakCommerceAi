import { describe, expect, it, vi } from "vitest";

import type { SellerContext } from "../../products/seller-context.js";
import {
  updateProductStockInputSchema,
  updateProductStockTool,
} from "./update-stock.js";

describe("updateProductStockTool", () => {
  it("validates input schema correctly", () => {
    const valid = updateProductStockInputSchema.safeParse({
      variantId: "123e4567-e89b-12d3-a456-426614174000",
      productTitle: "Test Kurta",
      newQuantity: 25,
      reason: "Restocked inventory",
    });
    expect(valid.success).toBe(true);

    const negative = updateProductStockInputSchema.safeParse({
      variantId: "123e4567-e89b-12d3-a456-426614174000",
      productTitle: "Test Kurta",
      newQuantity: -5,
    });
    expect(negative.success).toBe(false);
  });

  it("executes update against the seller database context", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: "var-1",
        product_id: "prod-1",
        title: "Medium Blue",
        quantity_on_hand: 50,
        inventory_state: "in_stock",
      },
      error: null,
    });

    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    const fromMock = vi.fn().mockReturnValue({ update: updateMock });

    const authMock = {
      sellerId: "seller-123",
      db: { from: fromMock },
    } as unknown as SellerContext;

    const tool = updateProductStockTool(authMock);
    const result = await tool.execute({
      variantId: "var-1",
      productTitle: "Test Kurta",
      newQuantity: 50,
      reason: "Restock",
    });

    expect(fromMock).toHaveBeenCalledWith("product_variants");
    expect(updateMock).toHaveBeenCalledWith({ quantity_on_hand: 50 });
    expect(eqMock).toHaveBeenCalledWith("id", "var-1");
    expect(result).toEqual({
      status: "success",
      message: 'Successfully updated stock for "Test Kurta" to 50 units.',
      variantId: "var-1",
      productId: "prod-1",
      quantityOnHand: 50,
      inventoryState: "in_stock",
      reason: "Restock",
    });
  });

  it("handles database errors gracefully", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "variant not found or access denied" },
    });

    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    const fromMock = vi.fn().mockReturnValue({ update: updateMock });

    const authMock = {
      sellerId: "seller-123",
      db: { from: fromMock },
    } as unknown as SellerContext;

    const tool = updateProductStockTool(authMock);
    const result = await tool.execute({
      variantId: "var-missing",
      productTitle: "Test Kurta",
      newQuantity: 10,
    });

    expect(result).toEqual({
      status: "error",
      message: "Failed to update stock: variant not found or access denied",
      variantId: "var-missing",
      productTitle: "Test Kurta",
    });
  });
});
