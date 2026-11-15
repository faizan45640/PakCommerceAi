/**
 * Tier 2 - the sales-agent tool surface against the real local database.
 *
 * Proves the property that matters: the workspace comes from the conversation,
 * so one shop's conversation can never read another shop's catalogue, and that
 * every call leaves an ai_tool_calls row the owning seller (only) can read.
 *
 * Requires the local Supabase stack: `npx supabase start`.
 */

import { randomUUID } from "node:crypto";

import { createSupabaseAdminClient } from "@pakcommerce/integrations/supabase";
import request from "supertest";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { createApiSupabaseUserClient } from "../lib/supabase.js";
import type { TestSeller } from "../testing/api-test-env.js";
import {
  applyTestEnv,
  createTestSeller,
  createTestVariant,
  deleteTestSeller,
  LOCAL_SERVICE_ROLE_KEY,
  LOCAL_SUPABASE_URL,
} from "../testing/api-test-env.js";

const TOKEN = "itest-agent-token";
const agent = (method: "get" | "post", path: string) =>
  request(createApp())[method](`/api/v1/agent${path}`).set("Authorization", `Bearer ${TOKEN}`);

const admin = () =>
  createSupabaseAdminClient({
    url: LOCAL_SUPABASE_URL,
    anonKey: "unused",
    serviceRoleKey: LOCAL_SERVICE_ROLE_KEY,
  });

let alice: TestSeller;
let bob: TestSeller;

beforeAll(() => {
  applyTestEnv();
  process.env.AGENT_SERVICE_TOKEN = TOKEN;
});

beforeEach(async () => {
  alice = await createTestSeller("alice");
  bob = await createTestSeller("bob");
});

afterEach(async () => {
  await deleteTestSeller(alice);
  await deleteTestSeller(bob);
});

/** A live product with Size/Colour variants, titled so shops are told apart. */
async function shopWithProduct(seller: TestSeller, title: string) {
  const { productId } = await createTestVariant(seller, { quantity: 0 });
  const db = admin();
  await db.from("products").update({ title, status: "active" }).eq("id", productId);
  await db.from("product_variants").delete().eq("product_id", productId);
  await db.from("product_variants").insert([
    {
      product_id: productId,
      workspace_id: seller.workspaceId,
      title: "M / Black",
      option_values: [
        { optionName: "Size", value: "M" },
        { optionName: "Colour", value: "Black" },
      ],
      price_amount_minor: 250000,
      quantity_on_hand: 0,
      position: 0,
    },
    {
      product_id: productId,
      workspace_id: seller.workspaceId,
      title: "L / Black",
      option_values: [
        { optionName: "Size", value: "L" },
        { optionName: "Colour", value: "Black" },
      ],
      price_amount_minor: 260000,
      quantity_on_hand: 7,
      position: 1,
    },
  ]);
  return productId;
}

async function conversationFor(seller: TestSeller, aiEnabled: boolean): Promise<string> {
  const response = await request(createApp())
    .post("/api/v1/conversations/mock-inbound")
    .set("Authorization", `Bearer ${seller.accessToken}`)
    .send({
      workspaceId: seller.workspaceId,
      From: "whatsapp:+923001234567",
      ProfileName: "Ayesha Khan",
      Body: "Salam",
      MessageSid: `SM${randomUUID().replace(/-/g, "")}`,
      aiEnabled,
    });
  expect([200, 201]).toContain(response.status);
  return response.body.data.conversationId;
}

describe("agent tools against the database", () => {
  it("searchProducts only ever sees the conversation's own workspace", async () => {
    await shopWithProduct(alice, "Alice Lawn Suit");
    await shopWithProduct(bob, "Bob Wool Shawl");
    const bobsConversation = await conversationFor(bob, true);

    const response = await agent("post", "/tools/searchProducts").send({
      conversationId: bobsConversation,
      // A hostile or buggy caller naming Alice's shop changes nothing.
      workspaceId: alice.workspaceId,
      input: {},
    });

    expect(response.status).toBe(200);
    const names = response.body.output.products.map((p: { name: string }) => p.name);
    expect(names).toEqual(["Bob Wool Shawl"]);
    expect(JSON.stringify(response.body)).not.toContain("Alice");
    // Compact and buyer-safe: no seller ids, no phones.
    expect(JSON.stringify(response.body)).not.toContain(bob.sellerId);
    expect(JSON.stringify(response.body)).not.toContain("923001234567");
  });

  it("checkInventory reports sizes, colours, PKR prices and stock buckets", async () => {
    const productId = await shopWithProduct(alice, "Alice Lawn Suit");
    const conversation = await conversationFor(alice, true);

    const all = await agent("post", "/tools/checkInventory").send({
      conversationId: conversation,
      input: { productId },
    });
    expect(all.status).toBe(200);
    expect(all.body.output).toMatchObject({
      name: "Alice Lawn Suit",
      availableSizes: ["M", "L"],
      availableColours: ["Black"],
      anyInStock: true,
    });

    const medium = await agent("post", "/tools/checkInventory").send({
      conversationId: conversation,
      input: { productId, size: "m", colour: "black" },
    });
    expect(medium.body.output.anyInStock).toBe(false);
    expect(medium.body.output.variants).toEqual([
      expect.objectContaining({
        label: "Size: M, Colour: Black",
        pricePkr: 2500,
        inStock: false,
        quantity: "none",
      }),
    ]);

    const large = await agent("post", "/tools/checkInventory").send({
      conversationId: conversation,
      input: { productId, size: "L" },
    });
    expect(large.body.output.variants[0]).toMatchObject({ pricePkr: 2600, quantity: "4-10" });
  });

  it("checkInventory cannot read another shop's product", async () => {
    const alicesProduct = await shopWithProduct(alice, "Alice Lawn Suit");
    const bobsConversation = await conversationFor(bob, true);

    const response = await agent("post", "/tools/checkInventory").send({
      conversationId: bobsConversation,
      input: { productId: alicesProduct },
    });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("product_not_found");
  });

  it("records an audit row the owning seller can read and others cannot", async () => {
    await shopWithProduct(alice, "Alice Lawn Suit");
    const conversation = await conversationFor(alice, true);

    await agent("post", "/tools/searchProducts").send({
      conversationId: conversation,
      input: { query: "lawn" },
    });
    await agent("post", "/tools/searchProducts").send({
      conversationId: conversation,
      input: { limit: 0 },
    });

    const mine = await createApiSupabaseUserClient(alice.accessToken)
      .from("ai_tool_calls")
      .select("*")
      .order("created_at");
    expect(mine.error).toBeNull();
    expect(mine.data).toHaveLength(2);
    expect(mine.data![0]).toMatchObject({
      tool_name: "searchProducts",
      audience: "sales_agent",
      actor: "ai",
      workspace_id: alice.workspaceId,
      conversation_id: conversation,
      ok: true,
      error_code: null,
      input: { query: "lawn" },
    });
    expect(mine.data![1]).toMatchObject({ ok: false, error_code: "invalid_input" });

    const theirs = await createApiSupabaseUserClient(bob.accessToken)
      .from("ai_tool_calls")
      .select("id");
    expect(theirs.data).toEqual([]);

    const forged = await createApiSupabaseUserClient(alice.accessToken)
      .from("ai_tool_calls")
      .insert({
        seller_id: alice.sellerId,
        tool_name: "x",
        audience: "copilot",
        actor: "seller",
        ok: true,
        duration_ms: 1,
      });
    expect(forged.error).not.toBeNull();
  });
});
