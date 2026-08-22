import { describe, expect, it } from "vitest";

import { productListItemSchema } from "../products/index.js";
import {
  apiContractVersion,
  apiDataResponseSchema,
  apiErrorSchema,
  apiListResponseSchema,
  apiMetaSchema,
} from "./index.js";

describe("api contract", () => {
  it("contract version is pinned", () => {
    expect(apiContractVersion).toBe("2026-08-22");
  });
});

describe("apiMetaSchema", () => {
  it("accepts a valid page of results", () => {
    const result = apiMetaSchema.safeParse({ page: 1, pageSize: 25, total: 120 });

    expect(result.success).toBe(true);
  });

  it("rejects zero or negative page", () => {
    const result = apiMetaSchema.safeParse({ page: 0, pageSize: 25, total: 120 });

    expect(result.success).toBe(false);
  });

  it("rejects fractional pageSize", () => {
    const result = apiMetaSchema.safeParse({ page: 1, pageSize: 12.5, total: 120 });

    expect(result.success).toBe(false);
  });
});

describe("apiErrorSchema", () => {
  it("parses a validation error with field details", () => {
    const result = apiErrorSchema.safeParse({
      error: {
        code: "validation_error",
        message: "Request body is invalid.",
        details: {
          name: ["Name is required."],
          variants: ["At least one variant is required."],
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("parses an error without details", () => {
    const result = apiErrorSchema.safeParse({
      error: { code: "not_found", message: "Product not found." },
    });

    expect(result.success).toBe(true);
  });

  it("rejects unknown error codes", () => {
    const result = apiErrorSchema.safeParse({
      error: { code: "something_broke", message: "Oops." },
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty message", () => {
    const result = apiErrorSchema.safeParse({
      error: { code: "internal_error", message: "" },
    });

    expect(result.success).toBe(false);
  });
});

describe("response envelope factories", () => {
  const listItem = {
    id: "44444444-4444-4444-8444-444444444444",
    sellerId: "22222222-2222-4222-8222-222222222222",
    workspaceId: "33333333-3333-4333-8333-333333333333",
    title: "Ajrak Kurta",
    slug: "ajrak-kurta",
    status: "active",
    tags: ["handloom"],
    categoryIds: [],
    primaryImage: null,
    variantCount: 3,
    priceRange: {
      min: { amountMinor: 250000 },
      max: { amountMinor: 320000 },
    },
    inventoryState: "in_stock",
    createdAt: "2026-07-12T10:00:00.000Z",
    updatedAt: "2026-07-12T10:00:00.000Z",
    archivedAt: null,
  };

  it("apiDataResponseSchema wraps a single item", () => {
    const schema = apiDataResponseSchema(productListItemSchema);
    const result = schema.safeParse({ data: listItem });

    expect(result.success).toBe(true);
  });

  it("apiListResponseSchema wraps items with pagination meta", () => {
    const schema = apiListResponseSchema(productListItemSchema);
    const result = schema.safeParse({
      data: [listItem],
      meta: { page: 2, pageSize: 25, total: 51 },
    });

    expect(result.success).toBe(true);
  });

  it("apiListResponseSchema rejects a missing meta block", () => {
    const schema = apiListResponseSchema(productListItemSchema);
    const result = schema.safeParse({ data: [listItem] });

    expect(result.success).toBe(false);
  });

  it("envelopes reject invalid inner payloads", () => {
    const schema = apiDataResponseSchema(productListItemSchema);
    const result = schema.safeParse({ data: { ...listItem, status: "detonated" } });

    expect(result.success).toBe(false);
  });
});
