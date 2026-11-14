/**
 * Tier 2 — copilot tools end to end.
 *
 * Real Supabase stack, real JWTs, real RLS. The tools query as the seller, so
 * the property under test is "the tool returns the seller's own rows and only
 * those" — which only means something with the real database.
 *
 * Requires the local Supabase stack: `npx supabase start`.
 */

import request from "supertest";
import { beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { createApiSupabaseUserClient } from "../../lib/supabase.js";
import type { TestSeller } from "../../testing/api-test-env.js";
import {
  applyTestEnv,
  createTestSeller,
  deleteTestSeller,
  productPayload,
} from "../../testing/api-test-env.js";
import { sellerContext } from "../../middleware/seller-context.js";
import { createCopilotTools } from "./index.js";

const app = () => createApp();
const PRODUCTS = "/api/v1/products";

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

/**
 * Creates a product through the real HTTP API, exactly like products.itest.
 *
 * Calling the create_product RPC directly would need the DB-shaped payload
 * (workspace_id, seller_id) that the API service builds from the contract —
 * passing the contract payload to the RPC leaves seller_id null and trips RLS.
 */
async function createProduct(seller: TestSeller, overrides: Record<string, unknown> = {}) {
  const response = await request(app())
    .post(PRODUCTS)
    .set("Authorization", `Bearer ${seller.accessToken}`)
    .send(productPayload(seller.workspaceId, overrides));

  expect(response.status).toBe(201);
  return response.body.data.id as string;
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

  it("returns the real Postgres error so the model can correct and retry", async () => {
    // The retry loop works because the tool surfaces the database error as a
    // structured message the model can act on. This test pins that contract:
    // a wrong column name must come back as a readable error, not a 500.
    const result = await toolsFor(alice).queryDatabase.execute({
      queryDescription: "titles with a made-up column",
      sql: "select product_name from products",
    });

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.message).toMatch(/rejected/i);
  });

  it("can query an aggregate over variants (non-obvious column names)", async () => {
    await createProduct(alice, {
      title: "Lawn Kurta",
      variants: [
        { title: "Medium", sku: "KURTA-M", price: { amountMinor: 250000 } },
        { title: "Large", sku: "KURTA-L", price: { amountMinor: 275000 } },
      ],
    });

    // The schema document tells the model about price_amount_minor; this proves
    // a query that would fail without that knowledge actually runs.
    const result = await toolsFor(alice).queryDatabase.execute({
      queryDescription: "average variant price in paisa",
      sql: "select avg(price_amount_minor)::int as avg_price_paisa from product_variants",
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    const row = result.rows[0] as { avg_price_paisa: string };
    expect(Number(row.avg_price_paisa)).toBe(262500);
  });
});

describe("getSchema tool", () => {
  it("lists the owned tables with their real columns", async () => {
    const result = await toolsFor(alice).getSchema.execute({});

    expect(result.status).toBe("success");
    if (result.status !== "success") return;

    const tables = result.tables as { table_name: string }[];
    const names = tables.map((t) => t.table_name);

    expect(names).toContain("products");
    expect(names).toContain("product_variants");
  });

  it("describes one table on request", async () => {
    const result = await toolsFor(alice).getSchema.execute({ table: "products" });

    expect(result.status).toBe("success");
    if (result.status !== "success") return;

    const rows = result.tables as { table_name: string; column_name: string; data_type: string }[];
    expect(rows.every((r) => r.table_name === "products")).toBe(true);
    expect(rows.map((r) => r.column_name)).toContain("title");
    expect(rows.map((r) => r.column_name)).toContain("workspace_id");
    expect(rows.map((r) => r.column_name)).toContain("search_text");
  });

  it("cannot be tricked into describing tables outside the owned set", async () => {
    // The input schema caps the table name to QUERYABLE_TABLES; a model cannot
    // ask about auth tables or inject SQL through the tool input.
    const result = await toolsFor(alice).getSchema.execute({
      // @ts-expect-error - the enum rejects anything outside the owned tables
      table: "auth.users",
    });

    expect(result.status).toBe("error");
  });
});

describe("createDraftOrder tool", () => {
  async function variantOf(seller: TestSeller, productId: string) {
    const { data, error } = await createApiSupabaseUserClient(seller.accessToken)
      .from("product_variants")
      .select("id, quantity_on_hand, price_amount_minor")
      .eq("product_id", productId)
      .single();
    expect(error).toBeNull();
    return data!;
  }

  async function movementCount(seller: TestSeller) {
    const { count } = await createApiSupabaseUserClient(seller.accessToken)
      .from("stock_movements")
      .select("id", { count: "exact", head: true });
    return count ?? 0;
  }

  const customer = { name: "Ali", phone: "03001234567", city: "Lahore" };

  it("creates a draft at the catalogue price and leaves stock alone", async () => {
    const productId = await createProduct(alice, {
      title: "Alice Kurta",
      variants: [
        {
          title: "Medium",
          price: { amountMinor: 250000 },
          inventory: {
            trackInventory: true,
            quantityOnHand: 10,
            lowStockThreshold: null,
            state: "in_stock",
          },
        },
      ],
    });
    const variant = await variantOf(alice, productId);
    expect(variant.quantity_on_hand).toBe(10);
    const movementsBefore = await movementCount(alice);

    const tool = toolsFor(alice).createDraftOrder;
    expect(tool.needsApproval).toBe(true);

    const result = await tool.execute({
      customer,
      items: [{ variantId: variant.id, productId, quantity: 2 }],
      shippingFee: 20000,
      // A confused model trying to set its own price/status: must be ignored.
      ...({ status: "confirmed", unitPrice: 1 } as object),
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.orderStatus).toBe("draft");
    expect(result.itemCount).toBe(2);
    expect(result.total).toBe(2 * 250000 + 20000);
    expect(result.message).toContain("Ali (Lahore)");

    const db = createApiSupabaseUserClient(alice.accessToken);
    const { data: order } = await db
      .from("orders")
      .select("status, workspace_id, total_amount_minor, confirmed_at")
      .eq("id", result.orderId)
      .single();
    expect(order).toMatchObject({
      status: "draft",
      workspace_id: alice.workspaceId,
      total_amount_minor: 520000,
      confirmed_at: null,
    });

    const { data: lines } = await db
      .from("order_items")
      .select("unit_price_amount_minor, quantity")
      .eq("order_id", result.orderId);
    expect(lines).toEqual([{ unit_price_amount_minor: 250000, quantity: 2 }]);

    const after = await variantOf(alice, productId);
    expect(after.quantity_on_hand).toBe(variant.quantity_on_hand);
    expect(await movementCount(alice)).toBe(movementsBefore);
  });

  it("refuses another seller's variant and creates nothing", async () => {
    const bobProduct = await createProduct(bob, { title: "Bob Kurta" });
    const bobVariant = await variantOf(bob, bobProduct);

    const result = await toolsFor(alice).createDraftOrder.execute({
      customer,
      items: [{ variantId: bobVariant.id, productId: bobProduct, quantity: 1 }],
    });

    expect(result.status).toBe("error");

    const { count } = await createApiSupabaseUserClient(alice.accessToken)
      .from("orders")
      .select("id", { count: "exact", head: true });
    expect(count).toBe(0);
  });
});
