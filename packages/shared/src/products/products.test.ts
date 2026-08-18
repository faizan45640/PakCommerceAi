import { describe, expect, it } from "vitest";

import {
  createProductInputSchema,
  moneySchema,
  productContractVersion,
  productSchema,
  productSearchQuerySchema,
} from "./index.js";

const NOW = "2026-07-12T10:00:00.000Z";
const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const SELLER_ID = "22222222-2222-4222-8222-222222222222";
const WORKSPACE_ID = "33333333-3333-4333-8333-333333333333";
const VARIANT_ID = "44444444-4444-4444-8444-444444444444";

function variant(overrides: Record<string, unknown> = {}) {
  return {
    id: VARIANT_ID,
    productId: PRODUCT_ID,
    title: "Default",
    status: "active",
    price: { amountMinor: 250_000, currency: "PKR" },
    optionValues: [],
    inventory: {
      trackInventory: true,
      quantityOnHand: 10,
      lowStockThreshold: 2,
      state: "in_stock",
    },
    position: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function image(id: string, isPrimary: boolean) {
  return {
    id,
    productId: PRODUCT_ID,
    url: "https://cdn.example.com/lawn-kurta.jpg",
    altText: null,
    position: 0,
    isPrimary,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_ID,
    sellerId: SELLER_ID,
    workspaceId: WORKSPACE_ID,
    title: "Lawn Kurta",
    slug: "lawn-kurta",
    status: "active",
    tags: [],
    categoryIds: [],
    options: [],
    variants: [variant()],
    images: [],
    searchText: "lawn kurta",
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
    ...overrides,
  };
}

function option(position: number) {
  return { name: `Option ${position}`, values: ["a"], position };
}

describe("product contract", () => {
  it("contract version is pinned", () => {
    expect(productContractVersion).toBe("2026-07-12");
  });
});

describe("money", () => {
  it("money rejects fractional minor units", () => {
    // Prices are integer minor units precisely so money never touches a float.
    expect(moneySchema.safeParse({ amountMinor: 10.5 }).success).toBe(false);
  });

  it("money rejects negative amounts", () => {
    expect(moneySchema.safeParse({ amountMinor: -1 }).success).toBe(false);
  });

  it("money defaults currency to PKR", () => {
    const result = moneySchema.parse({ amountMinor: 1000 });
    expect(result.currency).toBe("PKR");
  });

  it("money rejects non-PKR currency", () => {
    expect(moneySchema.safeParse({ amountMinor: 1000, currency: "USD" }).success).toBe(false);
  });
});

describe("productSchema", () => {
  it("product rejects two primary images", () => {
    const result = productSchema.safeParse(
      product({
        images: [
          image("55555555-5555-4555-8555-555555555555", true),
          image("66666666-6666-4666-8666-666666666666", true),
        ],
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes("images"))).toBe(true);
  });

  it("product accepts exactly one primary image", () => {
    const result = productSchema.safeParse(
      product({
        images: [
          image("55555555-5555-4555-8555-555555555555", true),
          image("66666666-6666-4666-8666-666666666666", false),
        ],
      }),
    );

    expect(result.success).toBe(true);
  });

  it("product requires at least one variant", () => {
    expect(productSchema.safeParse(product({ variants: [] })).success).toBe(false);
  });

  it("product rejects more than three options", () => {
    const result = productSchema.safeParse(
      product({ options: [option(0), option(1), option(2), option(3)] }),
    );

    expect(result.success).toBe(false);
  });

  it("product trims and rejects blank title", () => {
    expect(productSchema.safeParse(product({ title: "   " })).success).toBe(false);
  });
});

describe("createProductInputSchema", () => {
  const minimal = {
    workspaceId: WORKSPACE_ID,
    title: "Lawn Kurta",
    variants: [{ title: "Default", price: { amountMinor: 250_000 } }],
  };

  it("create input defaults status to draft", () => {
    expect(createProductInputSchema.parse(minimal).status).toBe("draft");
  });

  it("create input defaults collections to empty arrays", () => {
    const result = createProductInputSchema.parse(minimal);

    expect(result.tags).toEqual([]);
    expect(result.categoryIds).toEqual([]);
    expect(result.options).toEqual([]);
    expect(result.images).toEqual([]);
  });

  it("create input enforces single primary image", () => {
    const result = createProductInputSchema.safeParse({
      ...minimal,
      images: [
        { url: "https://cdn.example.com/a.jpg", altText: null, isPrimary: true },
        { url: "https://cdn.example.com/b.jpg", altText: null, isPrimary: true },
      ],
    });

    expect(result.success).toBe(false);
  });
});

describe("productSearchQuerySchema", () => {
  it("search query defaults sort and limit", () => {
    const result = productSearchQuerySchema.parse({ workspaceId: WORKSPACE_ID });

    expect(result.sort).toBe("updated_desc");
    expect(result.limit).toBe(25);
  });

  it("search query rejects limit above 100", () => {
    const result = productSearchQuerySchema.safeParse({
      workspaceId: WORKSPACE_ID,
      limit: 101,
    });

    expect(result.success).toBe(false);
  });

  it("search query requires workspace id", () => {
    // Tenant isolation starts here: a search with no workspace must not be constructible.
    expect(productSearchQuerySchema.safeParse({}).success).toBe(false);
  });
});
