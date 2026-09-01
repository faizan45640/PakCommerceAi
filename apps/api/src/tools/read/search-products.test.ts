import { beforeEach, describe, expect, it, vi } from "vitest";

import { productListItemSchema, type ProductListItem } from "@pakcommerce/shared";

import {
  searchProductsInputSchema,
  searchProductsTool,
  type SearchProductsResult,
} from "./search-products.js";

/** Narrows a tool result to one branch, failing the test if the status differs. */
function asError(result: SearchProductsResult) {
  if (result.status !== "error") throw new Error("expected error result");
  return result;
}

function asSuccess(result: SearchProductsResult) {
  if (result.status !== "success") throw new Error("expected success result");
  return result;
}

const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SELLER_ID = "33333333-3333-4333-8333-333333333333";

const LIST_ITEM: ProductListItem = {
  id: "11111111-1111-4111-8111-111111111111",
  sellerId: SELLER_ID,
  workspaceId: WORKSPACE_ID,
  title: "Lawn Kurta",
  slug: "lawn-kurta",
  status: "active",
  tags: ["summer"],
  categoryIds: [],
  createdAt: "2026-08-19T10:00:00+00:00",
  updatedAt: "2026-08-19T10:00:00+00:00",
  archivedAt: null,
  primaryImage: null,
  variantCount: 2,
  priceRange: {
    min: { amountMinor: 199900, currency: "PKR" },
    max: { amountMinor: 250000, currency: "PKR" },
  },
  inventoryState: "in_stock",
};

vi.mock("../../products/product-service.js", () => ({
  listProducts: vi.fn(),
}));

import { listProducts } from "../../products/product-service.js";

const mockedList = vi.mocked(listProducts);

beforeEach(() => {
  mockedList.mockReset();
});

function workspaceClient(isDefaultFound: boolean) {
  const maybeSingle = vi.fn(async () =>
    isDefaultFound ? { data: { id: WORKSPACE_ID }, error: null } : { data: null, error: null },
  );

  return {
    from: vi.fn((table: string) => {
      if (table === "workspaces") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })), maybeSingle })),
          })),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  };
}

function fakeAuth(overrides: Record<string, unknown> = {}) {
  return { sellerId: SELLER_ID, db: workspaceClient(true), ...overrides } as never;
}

describe("searchProductsInputSchema", () => {
  it("accepts a minimal query", () => {
    const result = searchProductsInputSchema.safeParse({ query: "kurta" });

    expect(result.success).toBe(true);
  });

  it("applies a default sort and limit", () => {
    const result = searchProductsInputSchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort).toBe("updated_desc");
      expect(result.data.limit).toBe(10);
    }
  });

  it("caps the limit at 25", () => {
    const result = searchProductsInputSchema.safeParse({ limit: 500 });

    expect(result.success).toBe(false);
  });

  it("rejects unknown statuses", () => {
    const result = searchProductsInputSchema.safeParse({ statuses: ["on_fire"] });

    expect(result.success).toBe(false);
  });
});

describe("searchProductsTool", () => {
  it("calls listProducts with the resolved workspace and returns structured output", async () => {
    mockedList.mockResolvedValueOnce({
      items: [LIST_ITEM],
      meta: { page: 1, pageSize: 10, total: 1 },
      nextCursor: null,
    });

    const result = await searchProductsTool(fakeAuth()).execute({
      query: "kurta",
      sort: "price_asc",
      limit: 5,
    });

    const ok = asSuccess(result);
    expect(ok.count).toBe(1);
    expect(ok.total).toBe(1);
    expect(ok.products).toHaveLength(1);

    // The caller's workspaceId was resolved from context, not invented by the model.
    expect(mockedList).toHaveBeenCalledWith(
      expect.objectContaining({ sellerId: SELLER_ID }),
      expect.objectContaining({ workspaceId: WORKSPACE_ID, query: "kurta", limit: 5 }),
    );

    // The output parses against the shared contract - the point of "structured output".
    const parsed = productListItemSchema.safeParse(ok.products[0]);
    expect(parsed.success).toBe(true);
  });

  it("reports a structured error when the seller has no workspace", async () => {
    const auth = { sellerId: SELLER_ID, db: workspaceClient(false) } as never;

    const result = await searchProductsTool(auth).execute({ query: "kurta" });

    const err = asError(result);
    expect(err.message).toMatch(/no workspace/i);
    expect(mockedList).not.toHaveBeenCalled();
  });

  it("never lets the model pass a workspaceId or sellerId", async () => {
    mockedList.mockResolvedValueOnce({
      items: [],
      meta: { page: 1, pageSize: 10, total: 0 },
      nextCursor: null,
    });

    // Spread an untyped object: at runtime Zod drops the unknown keys, and the
    // test proves the tool ignores them even if a model somehow emits them.
    const result = await searchProductsTool(fakeAuth()).execute({
      query: "kurta",
      ...({ workspaceId: "99999999-9999-4999-8999-999999999999", sellerId: "99999999-9999-4999-8999-999999999999" } as Record<string, string>),
    });

    expect(result.status).toBe("success");
    // The call used the context workspace, not anything the model supplied.
    expect(mockedList).toHaveBeenCalledWith(
      expect.objectContaining({ sellerId: SELLER_ID }),
      expect.objectContaining({ workspaceId: WORKSPACE_ID }),
    );
  });
});
