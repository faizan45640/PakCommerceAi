/**
 * Tier 2 — copilot tools end to end.
 *
 * Real Supabase stack, real JWTs, real RLS. The tools query as the seller, so
 * the property under test is "the tool returns the seller's own rows and only
 * those" — which only means something with the real database.
 *
 * Requires the local Supabase stack: `npx supabase start`.
 */

import { beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";

import { createApiSupabaseUserClient } from "../lib/supabase.js";
import type { TestSeller } from "../testing/api-test-env.js";
import {
  applyTestEnv,
  createTestSeller,
  deleteTestSeller,
  productPayload,
} from "../testing/api-test-env.js";
import { sellerContext } from "../products/seller-context.js";
import { createCopilotTools } from "../tools/index.js";

let alice: TestSeller;
let bob: TestSeller;

function toolsFor(seller: TestSeller) {
  const auth = sellerContext({
    auth: { userId: seller.sellerId, email: null, accessToken: seller.accessToken },
  } as never);
  return createCopilotTools(auth);
}

beforeAll(() => {
  applyTestEnv();
});

beforeEach(async () => {
  alice = await createTestSeller("alice");
  bob = await createTestSeller("bob");
});

afterEach(async () => {
  await deleteTestSeller(alice);
  await deleteTestSeller(bob);
});

async function createProduct(seller: TestSeller, overrides: Record<string, unknown> = {}) {
  const { data, error } = await createApiSupabaseUserClient(seller.accessToken)
    .rpc("create_product", {
      payload: productPayload(seller.workspaceId, overrides),
    });

  expect(error).toBeNull();
  return data as string;
}

describe("searchProducts tool", () => {
  it("returns only the seller's own products", async () => {
    await createProduct(alice, { title: "Alice Kurta" });
    await createProduct(bob, { title: "Bob Kurta" });

    const result = await toolsFor(alice).searchProducts.execute({ query: "Kurta" });

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.products.map((p) => p.title)).toEqual(["Alice Kurta"]);
  });

  it("filters by inventory state and status", async () => {
    await createProduct(alice, { title: "Stocked" });
    await createProduct(alice, { title: "Empty" });

    // Empty the second product's stock through the API.
    const products = await toolsFor(alice).searchProducts.execute({});
    expect(products.status).toBe("success");
    if (products.status !== "success") return;

    const emptyId = products.products.find((p) => p.title === "Empty")?.id;
    expect(emptyId).toBeTruthy();
    if (!emptyId) return;

    const { error } = await createApiSupabaseUserClient(alice.accessToken)
      .from("product_variants")
      .update({ quantity_on_hand: 0 })
      .eq("product_id", emptyId);
    expect(error).toBeNull();

    const lowResult = await toolsFor(alice).searchProducts.execute({
      inventoryStates: ["out_of_stock"],
    });

    expect(lowResult.status).toBe("success");
    if (lowResult.status !== "success") return;
    expect(lowResult.products.map((p) => p.title)).toEqual(["Empty"]);
  });

  it("resolves the seller's workspace without the model knowing it", async () => {
    await createProduct(alice, { title: "Mystery" });

    const result = await toolsFor(alice).searchProducts.execute({});

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.products.map((p) => p.workspaceId)).toEqual([alice.workspaceId]);
  });
});

describe("queryDatabase tool", () => {
  it("runs a read-only query as the seller, RLS intact", async () => {
    await createProduct(alice, { title: "Alice Kurta" });
    await createProduct(bob, { title: "Bob Kurta" });

    const result = await toolsFor(alice).queryDatabase.execute({
      queryDescription: "all product titles",
      sql: "select title from products order by title",
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.rows).toEqual([{ title: "Alice Kurta" }]);
  });

  it("rejects a mutating query even though the model asked for it", async () => {
    const result = await toolsFor(alice).queryDatabase.execute({
      queryDescription: "delete everything",
      sql: "delete from products",
    });

    expect(result.status).toBe("error");
  });

  it("rejects a multi-statement query", async () => {
    const result = await toolsFor(alice).queryDatabase.execute({
      queryDescription: "two statements",
      sql: "select 1; select 2",
    });

    expect(result.status).toBe("error");
  });

  it("reports a database-level rejection when the query is not SELECT", async () => {
    const result = await toolsFor(alice).queryDatabase.execute({
      queryDescription: "count",
      sql: "update products set title = 'x'",
    });

    expect(result.status).toBe("error");
  });

  it("cannot reach another seller's rows through WITH", async () => {
    await createProduct(alice, { title: "Alice Kurta" });
    await createProduct(bob, { title: "Bob Secret" });

    const result = await toolsFor(alice).queryDatabase.execute({
      queryDescription: "titles via CTE",
      sql: "with all_products as (select title from products) select title from all_products",
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.rows).toEqual([{ title: "Alice Kurta" }]);
  });
});
