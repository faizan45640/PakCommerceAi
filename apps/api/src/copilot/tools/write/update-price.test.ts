import { describe, expect, it, vi } from "vitest";

import type { SellerContext } from "../../../middleware/seller-context.js";
import {
  updateProductPriceInputSchema,
  updateProductPriceTool,
} from "./update-price.js";

describe("updateProductPriceInputSchema", () => {
  it("accepts valid price update input", () => {
    const result = updateProductPriceInputSchema.safeParse({
      variantId: "11111111-1111-4111-8111-111111111111",
      productTitle: "Peshawari Chappal",
      newPricePkr: 4200,
      compareAtPricePkr: 5000,
      reason: "Holiday sale",
    });

    expect(result.success).toBe(true);
  });

  it("rejects non-positive prices", () => {
    const result = updateProductPriceInputSchema.safeParse({
      variantId: "11111111-1111-4111-8111-111111111111",
      productTitle: "Peshawari Chappal",
      newPricePkr: -500,
    });

    expect(result.success).toBe(false);
  });
});

describe("updateProductPriceTool execution", () => {
  it("updates price via seller auth db", async () => {
    const fakeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        product_id: "22222222-2222-4222-8222-222222222222",
        title: "Size 42",
        price_amount_minor: 420000,
        price_currency: "PKR",
      },
      error: null,
    });

    const fakeSelect = vi.fn().mockReturnValue({ single: fakeSingle });
    const fakeEq = vi.fn().mockReturnValue({ select: fakeSelect });
    const fakeUpdate = vi.fn().mockReturnValue({ eq: fakeEq });
    const fakeFrom = vi.fn().mockReturnValue({ update: fakeUpdate });

    const fakeAuth = {
      db: { from: fakeFrom },
    } as unknown as SellerContext;

    const tool = updateProductPriceTool(fakeAuth);
    const result = await tool.execute({
      variantId: "11111111-1111-4111-8111-111111111111",
      productTitle: "Peshawari Chappal",
      newPricePkr: 4200,
    });

    expect(result.status).toBe("success");
    expect(fakeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        price_amount_minor: 420000,
        price_currency: "PKR",
      }),
    );
  });
});
