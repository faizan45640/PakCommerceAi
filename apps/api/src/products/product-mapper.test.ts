import type { Database } from "@pakcommerce/integrations/supabase";
import { productSchema } from "@pakcommerce/shared";
import { describe, expect, it } from "vitest";

import type { ProductListRow } from "./product-mapper.js";
import { rollUpInventoryState, toProduct, toProductListItem } from "./product-mapper.js";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type VariantRow = Database["public"]["Tables"]["product_variants"]["Row"];

const NOW = "2026-08-19T10:00:00+00:00";
const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SELLER_ID = "33333333-3333-4333-8333-333333333333";

function productRow(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: PRODUCT_ID,
    workspace_id: WORKSPACE_ID,
    seller_id: SELLER_ID,
    title: "Lawn Kurta",
    slug: "lawn-kurta",
    description: null,
    status: "active",
    tags: [],
    category_ids: [],
    options: [],
    search_text: "lawn kurta",
    created_at: NOW,
    updated_at: NOW,
    archived_at: null,
    ...overrides,
  };
}

function variantRow(overrides: Partial<VariantRow> = {}): VariantRow {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    product_id: PRODUCT_ID,
    workspace_id: WORKSPACE_ID,
    title: "Medium",
    sku: null,
    barcode: null,
    status: "active",
    price_amount_minor: 250000,
    price_currency: "PKR",
    compare_at_price_amount_minor: null,
    compare_at_price_currency: null,
    option_values: [],
    track_inventory: true,
    quantity_on_hand: 10,
    low_stock_threshold: null,
    inventory_state: "in_stock",
    position: 0,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

describe("toProduct", () => {
  it("produces a product the contract accepts", () => {
    // The whole point of the mapper: what comes out of the database must satisfy
    // the schema the rest of the system is written against.
    const result = productSchema.safeParse(toProduct(productRow(), [variantRow()]));

    expect(result.success).toBe(true);
  });

  it("splits the money columns back into the contract shape", () => {
    const [variant] = toProduct(productRow(), [
      variantRow({ price_amount_minor: 199900, price_currency: "PKR" }),
    ]).variants;

    expect(variant.price).toEqual({ amountMinor: 199900, currency: "PKR" });
  });

  it("maps a missing compare-at price to null, not an empty object", () => {
    const [variant] = toProduct(productRow(), [variantRow()]).variants;

    expect(variant.compareAtPrice).toBeNull();
  });

  it("orders variants by position", () => {
    const product = toProduct(productRow(), [
      variantRow({ id: "55555555-5555-4555-8555-555555555555", title: "Large", position: 1 }),
      variantRow({ title: "Medium", position: 0 }),
    ]);

    expect(product.variants.map((variant) => variant.title)).toEqual(["Medium", "Large"]);
  });

  it("returns images as an empty array", () => {
    // There is no product_images table yet. Empty satisfies the contract;
    // inventing image records would not.
    expect(toProduct(productRow(), [variantRow()]).images).toEqual([]);
  });

  it("carries the generated inventory state through untouched", () => {
    const [variant] = toProduct(productRow(), [
      variantRow({ inventory_state: "low_stock", quantity_on_hand: 2, low_stock_threshold: 3 }),
    ]).variants;

    expect(variant.inventory.state).toBe("low_stock");
  });
});

describe("rollUpInventoryState", () => {
  it("reports in_stock when any variant is in stock", () => {
    expect(rollUpInventoryState(["out_of_stock", "in_stock"])).toBe("in_stock");
  });

  it("prefers low_stock over out_of_stock", () => {
    expect(rollUpInventoryState(["out_of_stock", "low_stock"])).toBe("low_stock");
  });

  it("reports out_of_stock when nothing is available", () => {
    expect(rollUpInventoryState(["out_of_stock", "untracked"])).toBe("out_of_stock");
  });

  it("reports untracked only when nothing is tracked", () => {
    // untracked must never mask a real out-of-stock.
    expect(rollUpInventoryState(["untracked"])).toBe("untracked");
  });

  it("treats a product with no variants as untracked", () => {
    expect(rollUpInventoryState([])).toBe("untracked");
  });
});

describe("toProductListItem", () => {
  function listRow(overrides: Partial<ProductListRow> = {}): ProductListRow {
    return {
      id: PRODUCT_ID,
      workspace_id: WORKSPACE_ID,
      seller_id: SELLER_ID,
      title: "Lawn Kurta",
      slug: "lawn-kurta",
      status: "active",
      tags: [],
      category_ids: [],
      created_at: NOW,
      updated_at: NOW,
      archived_at: null,
      variant_count: 2,
      min_price_amount_minor: 199900,
      max_price_amount_minor: 250000,
      price_currency: "PKR",
      variant_states: ["in_stock", "out_of_stock"],
      ...overrides,
    };
  }

  it("exposes the price range from the aggregated columns", () => {
    const item = toProductListItem(listRow());

    expect(item.priceRange.min.amountMinor).toBe(199900);
    expect(item.priceRange.max.amountMinor).toBe(250000);
  });

  it("coerces counts that arrive as strings", () => {
    // Postgres COUNT is bigint, which PostgREST serialises as a string. Left
    // uncoerced, variantCount would be "2" and fail the contract's int check.
    const item = toProductListItem(listRow({ variant_count: "2" as unknown as number }));

    expect(item.variantCount).toBe(2);
  });

  it("rolls the variant states up to one product state", () => {
    expect(toProductListItem(listRow()).inventoryState).toBe("in_stock");
  });

  it("reports no primary image", () => {
    expect(toProductListItem(listRow()).primaryImage).toBeNull();
  });
});
