import { describe, expect, it, vi } from "vitest";

import type { SellerContext } from "../../../middleware/seller-context.js";
import {
  updateProductDetailsInputSchema,
  updateProductDetailsTool,
} from "./update-product.js";

describe("updateProductDetailsInputSchema", () => {
  it("accepts valid product update input", () => {
    const result = updateProductDetailsInputSchema.safeParse({
      productId: "11111111-1111-4111-8111-111111111111",
      currentTitle: "Peshawari Chappal",
      newTitle: "Handcrafted Peshawari Chappal Royal Edition",
      newStatus: "active",
      newTags: ["traditional", "leather", "luxury"],
    });

    expect(result.success).toBe(true);
  });
});

describe("updateProductDetailsTool execution", () => {
  it("updates product metadata via seller auth db", async () => {
    const fakeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Handcrafted Peshawari Chappal Royal Edition",
        status: "active",
        tags: ["traditional", "leather"],
        description: "New description",
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

    const tool = updateProductDetailsTool(fakeAuth);
    const result = await tool.execute({
      productId: "11111111-1111-4111-8111-111111111111",
      currentTitle: "Peshawari Chappal",
      newTitle: "Handcrafted Peshawari Chappal Royal Edition",
    });

    expect(result.status).toBe("success");
    expect(fakeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Handcrafted Peshawari Chappal Royal Edition",
      }),
    );
  });
});
