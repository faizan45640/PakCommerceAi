import { describe, expect, it, vi } from "vitest";

import type { SellerContext } from "../../../middleware/seller-context.js";
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

  it("executes stock adjustment via adjust_stock RPC", async () => {
    const variantMock = {
      id: "var-1",
      product_id: "prod-1",
      workspace_id: "ws-1",
      title: "Medium Blue",
    };

    const updatedVariantMock = {
      quantity_on_hand: 50,
      inventory_state: "in_stock",
    };

    const singleMock = vi
      .fn()
      .mockResolvedValueOnce({ data: variantMock, error: null })
      .mockResolvedValueOnce({ data: updatedVariantMock, error: null });

    const eqMock = vi.fn().mockReturnValue({ single: singleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    const rpcMock = vi.fn().mockResolvedValue({ data: "movement-123", error: null });

    const authMock = {
      sellerId: "seller-123",
      db: { from: fromMock, rpc: rpcMock },
    } as unknown as SellerContext;

    const tool = updateProductStockTool(authMock);
    const result = await tool.execute({
      variantId: "var-1",
      productTitle: "Test Kurta",
      newQuantity: 50,
      reason: "Restock",
    });

    expect(fromMock).toHaveBeenCalledWith("product_variants");
    expect(rpcMock).toHaveBeenCalledWith("adjust_stock", {
      p_workspace_id: "ws-1",
      p_variant_id: "var-1",
      p_target_quantity: 50,
      p_reason: "manual_adjustment",
      p_note: "Restock",
    });
    expect(result).toEqual({
      status: "success",
      message: 'Stock for "Test Kurta" is now 50 pieces.',
      variantId: "var-1",
      productId: "prod-1",
      quantityOnHand: 50,
      inventoryState: "in_stock",
      movementId: "movement-123",
      reason: "Restock",
    });
  });

  it("handles missing variant gracefully", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "variant not found or access denied" },
    });

    const eqMock = vi.fn().mockReturnValue({ single: singleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    const rpcMock = vi.fn();

    const authMock = {
      sellerId: "seller-123",
      db: { from: fromMock, rpc: rpcMock },
    } as unknown as SellerContext;

    const tool = updateProductStockTool(authMock);
    const result = await tool.execute({
      variantId: "var-missing",
      productTitle: "Test Kurta",
      newQuantity: 10,
    });

    expect(rpcMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "error",
      message: "Failed to find product variant: variant not found or access denied",
      variantId: "var-missing",
      productTitle: "Test Kurta",
    });
  });

  it("handles RPC errors gracefully", async () => {
    const variantMock = {
      id: "var-1",
      product_id: "prod-1",
      workspace_id: "ws-1",
      title: "Medium Blue",
    };

    const singleMock = vi.fn().mockResolvedValue({ data: variantMock, error: null });
    const eqMock = vi.fn().mockReturnValue({ single: singleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    const rpcMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "quantity on hand cannot be negative" },
    });

    const authMock = {
      sellerId: "seller-123",
      db: { from: fromMock, rpc: rpcMock },
    } as unknown as SellerContext;

    const tool = updateProductStockTool(authMock);
    const result = await tool.execute({
      variantId: "var-1",
      productTitle: "Test Kurta",
      newQuantity: 10,
    });

    expect(rpcMock).toHaveBeenCalledWith("adjust_stock", expect.anything());
    expect(result).toEqual({
      status: "error",
      message: "Failed to update stock: quantity on hand cannot be negative",
      variantId: "var-1",
      productTitle: "Test Kurta",
    });
  });
});
