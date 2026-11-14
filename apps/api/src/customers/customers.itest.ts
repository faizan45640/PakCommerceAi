/**
 * Tier 2 - Customer 360 API end to end.
 *
 * Real Express app, real JWTs, real Postgres with RLS. Customers are never
 * created by the API: placing orders makes them (database trigger), so these
 * tests arrange customers by placing orders through the orders API.
 *
 * Requires the local Supabase stack: `npx supabase start`.
 */

import {
  customerDetailSchema,
  customerListItemSchema,
  customerNoteSchema,
} from "@pakcommerce/shared";
import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import type { TestSeller } from "../testing/api-test-env.js";
import {
  applyTestEnv,
  createTestSeller,
  createTestVariant,
  deleteTestSeller,
} from "../testing/api-test-env.js";

const app = () => createApp();
const CUSTOMERS = "/api/v1/customers";
const ORDERS = "/api/v1/orders";

let alice: TestSeller;
let bob: TestSeller;

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

function as(seller: TestSeller, method: "post" | "get" | "delete", path: string) {
  return request(app())[method](path).set("Authorization", `Bearer ${seller.accessToken}`);
}

interface Placed {
  orderId: string;
  customerId: string;
}

/** Places a draft order for a customer; optionally moves it to a status. */
async function placeOrder(
  seller: TestSeller,
  customer: { name?: string; phone: string; city?: string; email?: string },
  options: { status?: "confirmed" | "cancelled"; quantity?: number } = {},
): Promise<Placed> {
  const { productId, variantId } = await createTestVariant(seller, { quantity: 100 });

  const created = await as(seller, "post", ORDERS).send({
    workspaceId: seller.workspaceId,
    customer: {
      name: customer.name ?? "Ayesha Khan",
      phone: customer.phone,
      city: customer.city ?? "Lahore",
      email: customer.email,
      addressLine: "House 4, Gulberg",
    },
    items: [{ productId, variantId, quantity: options.quantity ?? 1 }],
  });
  expect(created.status).toBe(201);

  if (options.status) {
    const moved = await as(seller, "post", `${ORDERS}/${created.body.data.id}/transition`).send({
      workspaceId: seller.workspaceId,
      toStatus: options.status,
    });
    expect(moved.status).toBe(200);
  }

  return { orderId: created.body.data.id, customerId: created.body.data.customerId };
}

function list(seller: TestSeller, query: Record<string, unknown> = {}) {
  return as(seller, "get", CUSTOMERS).query({ workspaceId: seller.workspaceId, ...query });
}

describe("authentication", () => {
  it("rejects list, detail and notes with no token", async () => {
    expect((await request(app()).get(CUSTOMERS).query({ workspaceId: alice.workspaceId })).status)
      .toBe(401);
    expect((await request(app()).get(`${CUSTOMERS}/${randomUUID()}`)).status).toBe(401);
    expect((await request(app()).post(`${CUSTOMERS}/${randomUUID()}/notes`).send({})).status).toBe(
      401,
    );
  });
});

describe("customers are created by orders", () => {
  it("links orders with differently formatted phones to one customer", async () => {
    const first = await placeOrder(alice, { phone: "0300-1234567" });
    const second = await placeOrder(alice, { phone: "+92 300 1234567" });

    expect(first.customerId).toBeTruthy();
    expect(second.customerId).toBe(first.customerId);

    const response = await list(alice);
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].phone).toBe("+923001234567");
  });
});

describe("GET /api/v1/customers", () => {
  it("returns contract-valid list items with computed spend and tags", async () => {
    await placeOrder(alice, { phone: "03001234567" }, { status: "confirmed", quantity: 2 });

    const response = await list(alice);

    expect(response.status).toBe(200);
    expect(response.body.meta).toMatchObject({ page: 1, pageSize: 25, total: 1 });
    const [item] = response.body.data;
    expect(customerListItemSchema.safeParse(item).success).toBe(true);
    expect(item.summary).toMatchObject({
      // 2 x 250000 (the fixture variant price)
      lifetimeSpend: { amountMinor: 500000, currency: "PKR" },
      averageOrderValue: { amountMinor: 500000, currency: "PKR" },
      totalOrderCount: 1,
      completedOrderCount: 1,
    });
    expect(item.summary.statusCounts.confirmed).toBe(1);
    // One completed order: neither new nor repeat.
    expect(item.tags).toEqual([]);
  });

  it("searches by name, city and email", async () => {
    await placeOrder(alice, {
      name: "Ayesha Khan",
      phone: "03001234567",
      city: "Lahore",
      email: "Ayesha@Example.com",
    });
    await placeOrder(alice, { name: "Sana Malik", phone: "03451112222", city: "Karachi" });

    const byName = await list(alice, { query: "sana" });
    expect(byName.body.data.map((c: { name: string }) => c.name)).toEqual(["Sana Malik"]);

    const byCity = await list(alice, { query: "lahore" });
    expect(byCity.body.data.map((c: { name: string }) => c.name)).toEqual(["Ayesha Khan"]);

    const byEmail = await list(alice, { query: "AYESHA@example" });
    expect(byEmail.body.data.map((c: { name: string }) => c.name)).toEqual(["Ayesha Khan"]);
  });

  it("finds a customer by a phone typed in any format", async () => {
    await placeOrder(alice, { name: "Ayesha Khan", phone: "03001234567" });
    await placeOrder(alice, { name: "Sana Malik", phone: "03451112222" });

    for (const typed of [
      "0300-1234567",
      "0300 1234567",
      "+92 300 1234567",
      "923001234567",
      "00923001234567",
      "3001234567",
      "+923001234567",
    ]) {
      const response = await list(alice, { query: typed });
      expect(response.status, typed).toBe(200);
      expect(
        response.body.data.map((c: { name: string }) => c.name),
        typed,
      ).toEqual(["Ayesha Khan"]);
    }

    // A partial local number matches too.
    const partial = await list(alice, { query: "0345 111" });
    expect(partial.body.data.map((c: { name: string }) => c.name)).toEqual(["Sana Malik"]);
  });

  it("treats LIKE wildcards in the query as literal text", async () => {
    await placeOrder(alice, { name: "Ayesha Khan", phone: "03001234567" });

    const response = await list(alice, { query: "%" });
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it("filters by derived tags, all of which must match", async () => {
    // new: only a draft
    await placeOrder(alice, { name: "Newbie", phone: "03001111111" });
    // repeat: two completed orders
    await placeOrder(alice, { name: "Loyal", phone: "03002222222" }, { status: "confirmed" });
    const loyal = await placeOrder(
      alice,
      { name: "Loyal", phone: "0300-2222222" },
      { status: "confirmed" },
    );
    // flagged: a risk note
    const risky = await placeOrder(alice, { name: "Risky", phone: "03003333333" });
    await as(alice, "post", `${CUSTOMERS}/${risky.customerId}/notes`).send({
      workspaceId: alice.workspaceId,
      kind: "risk",
      body: "Refused delivery twice",
    });
    await as(alice, "post", `${CUSTOMERS}/${loyal.customerId}/notes`).send({
      workspaceId: alice.workspaceId,
      kind: "risk",
      body: "Late payer",
    });

    const names = async (tags: string) =>
      (await list(alice, { tags, sort: "name_asc" })).body.data.map(
        (c: { name: string }) => c.name,
      );

    expect(await names("new")).toEqual(["Newbie", "Risky"]);
    expect(await names("repeat")).toEqual(["Loyal"]);
    expect(await names("flagged")).toEqual(["Loyal", "Risky"]);
    expect(await names("repeat,flagged")).toEqual(["Loyal"]);
    expect(await names("new,flagged")).toEqual(["Risky"]);

    const all = (await list(alice, { sort: "name_asc" })).body.data;
    const tagsOf = (name: string) => all.find((c: { name: string }) => c.name === name).tags;
    expect(tagsOf("Newbie")).toEqual(["new"]);
    expect(tagsOf("Loyal")).toEqual(["repeat", "flagged"]);
  });

  it("returns nothing for has_returns until orders can be returned", async () => {
    await placeOrder(alice, { phone: "03001234567" }, { status: "confirmed" });
    const response = await list(alice, { tags: "has_returns" });
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it("sorts by spend, name and last order", async () => {
    await placeOrder(alice, { name: "Bilal", phone: "03001111111" }, { status: "confirmed" });
    await placeOrder(
      alice,
      { name: "Zara", phone: "03002222222" },
      { status: "confirmed", quantity: 5 },
    );
    await placeOrder(alice, { name: "Adeel", phone: "03003333333" });

    const order = async (sort: string) =>
      (await list(alice, { sort })).body.data.map((c: { name: string }) => c.name);

    expect(await order("spend_desc")).toEqual(["Zara", "Bilal", "Adeel"]);
    expect(await order("name_asc")).toEqual(["Adeel", "Bilal", "Zara"]);
    // Most recent order first.
    expect(await order("last_order_desc")).toEqual(["Adeel", "Zara", "Bilal"]);
    expect((await order("created_desc"))[0]).toBe("Adeel");
  });

  it("paginates with the cursor", async () => {
    await placeOrder(alice, { name: "A One", phone: "03001111111" });
    await placeOrder(alice, { name: "B Two", phone: "03002222222" });
    await placeOrder(alice, { name: "C Three", phone: "03003333333" });

    const first = await list(alice, { sort: "name_asc", limit: 2 });
    expect(first.body.data.map((c: { name: string }) => c.name)).toEqual(["A One", "B Two"]);
    expect(first.body.meta.total).toBe(3);
    expect(first.body.nextCursor).toBeTruthy();

    const second = await list(alice, {
      sort: "name_asc",
      limit: 2,
      cursor: first.body.nextCursor,
    });
    expect(second.body.data.map((c: { name: string }) => c.name)).toEqual(["C Three"]);
    expect(second.body.nextCursor).toBeNull();
  });

  it("is scoped to the seller", async () => {
    await placeOrder(alice, { name: "Ayesha Khan", phone: "03001234567" });
    await placeOrder(bob, { name: "Bob Customer", phone: "03001234567" });

    const mine = await list(alice);
    expect(mine.body.data.map((c: { name: string }) => c.name)).toEqual(["Ayesha Khan"]);

    // Bob asking for Alice's workspace sees nothing.
    const cross = await as(bob, "get", CUSTOMERS).query({ workspaceId: alice.workspaceId });
    expect(cross.status).toBe(200);
    expect(cross.body.data).toEqual([]);
  });

  it("rejects bad queries with 400", async () => {
    expect((await as(alice, "get", CUSTOMERS)).status).toBe(400);
    expect((await list(alice, { sort: "newest" })).status).toBe(400);
    expect((await list(alice, { tags: "vip" })).status).toBe(400);
    expect((await list(alice, { limit: 0 })).status).toBe(400);
  });
});

describe("GET /api/v1/customers/:customerId", () => {
  it("returns recent orders, notes and a timeline", async () => {
    const first = await placeOrder(alice, { phone: "03001234567" }, { status: "confirmed" });
    const second = await placeOrder(alice, { phone: "0300 1234567" });
    await as(alice, "post", `${CUSTOMERS}/${first.customerId}/notes`).send({
      workspaceId: alice.workspaceId,
      kind: "risk",
      body: "Refused delivery once",
    });

    const response = await as(alice, "get", `${CUSTOMERS}/${first.customerId}`).query({
      workspaceId: alice.workspaceId,
    });

    expect(response.status).toBe(200);
    const detail = response.body.data;
    expect(customerDetailSchema.safeParse(detail).success).toBe(true);
    expect(detail.tags).toEqual(["flagged"]);
    expect(detail.summary).toMatchObject({
      totalOrderCount: 2,
      completedOrderCount: 1,
      noteCount: 1,
      riskNoteCount: 1,
    });

    // Newest order first.
    expect(detail.recentOrders.map((o: { id: string }) => o.id)).toEqual([
      second.orderId,
      first.orderId,
    ]);
    expect(detail.recentOrders[0]).toMatchObject({ customerId: first.customerId });

    expect(detail.notes).toHaveLength(1);
    expect(detail.notes[0]).toMatchObject({ kind: "risk", body: "Refused delivery once" });

    // Newest first: the note, then the second order's draft, then the first
    // order's confirmation and its initial draft.
    expect(
      detail.timeline.map((event: Record<string, unknown>) =>
        event.type === "note_added"
          ? "note"
          : `${event.orderId === first.orderId ? "first" : "second"} ${event.fromStatus ?? "none"}>${event.toStatus}`,
      ),
    ).toEqual(["note", "second none>draft", "first draft>confirmed", "first none>draft"]);
  });

  it("returns an empty profile for a customer with a single draft", async () => {
    const placed = await placeOrder(alice, { phone: "03001234567" });

    const response = await as(alice, "get", `${CUSTOMERS}/${placed.customerId}`).query({
      workspaceId: alice.workspaceId,
    });

    expect(response.body.data.notes).toEqual([]);
    expect(response.body.data.tags).toEqual(["new"]);
    expect(response.body.data.summary.lifetimeSpend.amountMinor).toBe(0);
    expect(response.body.data.timeline).toHaveLength(1);
  });

  it("returns 404 for another seller's customer", async () => {
    const bobs = await placeOrder(bob, { phone: "03001234567" });

    const response = await as(alice, "get", `${CUSTOMERS}/${bobs.customerId}`).query({
      workspaceId: alice.workspaceId,
    });
    expect(response.status).toBe(404);

    const crossWorkspace = await as(alice, "get", `${CUSTOMERS}/${bobs.customerId}`).query({
      workspaceId: bob.workspaceId,
    });
    expect(crossWorkspace.status).toBe(404);
  });

  it("returns 404 for an unknown id and 400 for a malformed one or a missing workspace", async () => {
    expect(
      (await as(alice, "get", `${CUSTOMERS}/${randomUUID()}`).query({
        workspaceId: alice.workspaceId,
      })).status,
    ).toBe(404);
    expect(
      (await as(alice, "get", `${CUSTOMERS}/not-a-uuid`).query({
        workspaceId: alice.workspaceId,
      })).status,
    ).toBe(400);
    expect((await as(alice, "get", `${CUSTOMERS}/${randomUUID()}`)).status).toBe(400);
  });
});

describe("customer notes", () => {
  it("creates a note, defaulting the kind, and lists it on the profile", async () => {
    const placed = await placeOrder(alice, { phone: "03001234567" });

    const created = await as(alice, "post", `${CUSTOMERS}/${placed.customerId}/notes`).send({
      workspaceId: alice.workspaceId,
      body: "  Prefers evening delivery  ",
    });

    expect(created.status).toBe(201);
    expect(customerNoteSchema.safeParse(created.body.data).success).toBe(true);
    expect(created.body.data).toMatchObject({
      customerId: placed.customerId,
      sellerId: alice.sellerId,
      createdBy: alice.userId,
      kind: "note",
      body: "Prefers evening delivery",
    });
  });

  it("rejects an empty or over-long body and an unknown kind", async () => {
    const placed = await placeOrder(alice, { phone: "03001234567" });
    const post = (body: Record<string, unknown>) =>
      as(alice, "post", `${CUSTOMERS}/${placed.customerId}/notes`).send({
        workspaceId: alice.workspaceId,
        ...body,
      });

    expect((await post({ body: "   " })).status).toBe(400);
    expect((await post({ body: "x".repeat(2001) })).status).toBe(400);
    expect((await post({ body: "ok", kind: "warning" })).status).toBe(400);
    expect((await post({ body: "x".repeat(2000) })).status).toBe(201);
  });

  it("deletes a note", async () => {
    const placed = await placeOrder(alice, { phone: "03001234567" });
    const created = await as(alice, "post", `${CUSTOMERS}/${placed.customerId}/notes`).send({
      workspaceId: alice.workspaceId,
      kind: "risk",
      body: "Refused delivery",
    });
    const noteId = created.body.data.id;

    const deleted = await as(
      alice,
      "delete",
      `${CUSTOMERS}/${placed.customerId}/notes/${noteId}`,
    ).query({ workspaceId: alice.workspaceId });
    expect(deleted.status).toBe(204);

    const detail = await as(alice, "get", `${CUSTOMERS}/${placed.customerId}`).query({
      workspaceId: alice.workspaceId,
    });
    expect(detail.body.data.notes).toEqual([]);
    expect(detail.body.data.tags).not.toContain("flagged");

    // Deleting again is a 404.
    const again = await as(
      alice,
      "delete",
      `${CUSTOMERS}/${placed.customerId}/notes/${noteId}`,
    ).query({ workspaceId: alice.workspaceId });
    expect(again.status).toBe(404);
  });

  it("cannot add a note to, or delete a note of, another seller's customer", async () => {
    const bobs = await placeOrder(bob, { phone: "03001234567" });
    const bobsNote = await as(bob, "post", `${CUSTOMERS}/${bobs.customerId}/notes`).send({
      workspaceId: bob.workspaceId,
      body: "bob's note",
    });
    expect(bobsNote.status).toBe(201);

    const add = await as(alice, "post", `${CUSTOMERS}/${bobs.customerId}/notes`).send({
      workspaceId: bob.workspaceId,
      body: "intrusion",
    });
    expect(add.status).toBe(404);

    const del = await as(
      alice,
      "delete",
      `${CUSTOMERS}/${bobs.customerId}/notes/${bobsNote.body.data.id}`,
    ).query({ workspaceId: bob.workspaceId });
    expect(del.status).toBe(404);

    // Still there for Bob.
    const detail = await as(bob, "get", `${CUSTOMERS}/${bobs.customerId}`).query({
      workspaceId: bob.workspaceId,
    });
    expect(detail.body.data.notes).toHaveLength(1);
  });
});

describe("GET /api/v1/orders?customerId=", () => {
  it("returns only that customer's orders", async () => {
    const a1 = await placeOrder(alice, { phone: "03001234567" });
    const a2 = await placeOrder(alice, { phone: "0300 1234567" });
    await placeOrder(alice, { phone: "03451112222" });

    const response = await as(alice, "get", ORDERS).query({
      workspaceId: alice.workspaceId,
      customerId: a1.customerId,
      sort: "newest",
    });

    expect(response.status).toBe(200);
    expect(response.body.meta.total).toBe(2);
    expect(response.body.data.map((o: { id: string }) => o.id)).toEqual([a2.orderId, a1.orderId]);
    for (const order of response.body.data) {
      expect(order.customerId).toBe(a1.customerId);
    }
  });

  it("returns nothing for another seller's customer id and 400 for a malformed one", async () => {
    const bobs = await placeOrder(bob, { phone: "03001234567" });

    const cross = await as(alice, "get", ORDERS).query({
      workspaceId: alice.workspaceId,
      customerId: bobs.customerId,
    });
    expect(cross.status).toBe(200);
    expect(cross.body.data).toEqual([]);

    const bad = await as(alice, "get", ORDERS).query({
      workspaceId: alice.workspaceId,
      customerId: "nope",
    });
    expect(bad.status).toBe(400);
  });
});
