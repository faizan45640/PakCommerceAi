/**
 * Tier 2 - customers: phone normalisation, order -> customer linking, and the
 * computed summary.
 *
 * The identity rule exists twice (SQL `normalize_phone`, TS `normalizePhone`)
 * and both are checked against the same fixture table, so they cannot drift.
 *
 * Requires the local Supabase stack: `npx supabase start`.
 */

import {
  customerNoteKindValues,
  normalizePhone,
  phoneNormalizationFixtures,
} from "@pakcommerce/shared/customers";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  asUser,
  connect,
  createSeller,
  insertOrder,
  insertOrderItem,
  insertOrderStatusHistory,
  insertProduct,
  insertVariant,
  type Seller,
  withRollback,
} from "./testing/database.js";

let client: Client;

beforeAll(async () => {
  client = await connect();
});

afterAll(async () => {
  await client?.end();
});

async function enumValues(name: string): Promise<string[]> {
  const { rows } = await client.query<{ value: string }>(
    `select e.enumlabel as value
     from pg_type t join pg_enum e on e.enumtypid = t.oid
     where t.typname = $1 order by e.enumsortorder`,
    [name],
  );
  return rows.map((row) => row.value);
}

async function columnsOf(table: string): Promise<string[]> {
  const { rows } = await client.query<{ column_name: string }>(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = $1 order by column_name`,
    [table],
  );
  return rows.map((row) => row.column_name);
}

async function sellerWithVariant(label: string) {
  const seller = await createSeller(client, label);
  const productId = await insertProduct(client, seller, `${label}-kurta`);
  const variantId = await insertVariant(client, seller, productId, {
    sku: `${label}-1`,
    quantity: 100,
  });
  return { seller, productId, variantId };
}

/** A one-line draft order (total = `total`) with its history row. */
async function draftOrder(
  seller: Seller,
  productId: string,
  variantId: string,
  overrides: Record<string, unknown> = {},
  total = 100000,
): Promise<string> {
  const orderId = await insertOrder(client, seller, {
    customerAddressLine: "House 1, Street 2",
    subtotal: total,
    total,
    ...overrides,
  });
  await insertOrderItem(client, seller, orderId, productId, variantId, {
    unitPrice: total,
  });
  await insertOrderStatusHistory(client, seller, orderId);
  return orderId;
}

async function transition(seller: Seller, orderId: string, to: string) {
  await asUser(client, seller.userId, () =>
    client.query(`select public.transition_order_status($1, $2, $3, null)`, [
      orderId,
      seller.workspaceId,
      to,
    ]),
  );
}

async function customerOf(orderId: string) {
  const { rows } = await client.query<{
    customer_id: string;
    name: string;
    phone: string;
    email: string | null;
    city: string;
    address_line: string | null;
  }>(
    `select c.id as customer_id, c.name, c.phone, c.email, c.city, c.address_line
     from public.orders o join public.customers c on c.id = o.customer_id
     where o.id = $1`,
    [orderId],
  );
  return rows[0];
}

async function summaryOf(customerId: string) {
  const { rows } = await client.query(
    `select * from public.customer_summary where id = $1`,
    [customerId],
  );
  return rows[0];
}

describe("normalize_phone", () => {
  it.each(phoneNormalizationFixtures)(
    "SQL matches the shared fixture: $input -> $expected",
    async ({ input, expected }) => {
      const { rows } = await client.query<{ n: string }>(
        `select public.normalize_phone($1) as n`,
        [input],
      );
      expect(rows[0].n).toBe(expected);
      // ...and the TypeScript implementation agrees with it.
      expect(normalizePhone(input)).toBe(rows[0].n);
    },
  );

  it("returns null for null", async () => {
    const { rows } = await client.query(`select public.normalize_phone(null) as n`);
    expect(rows[0].n).toBeNull();
  });
});

describe("table shape", () => {
  it("customers has the contract columns", async () => {
    expect(await columnsOf("customers")).toEqual(
      [
        "address_line",
        "city",
        "created_at",
        "email",
        "id",
        "name",
        "phone",
        "seller_id",
        "updated_at",
        "workspace_id",
      ].sort(),
    );
  });

  it("customer_notes has the contract columns and the kind enum matches Zod", async () => {
    expect(await columnsOf("customer_notes")).toEqual(
      [
        "body",
        "created_at",
        "created_by",
        "customer_id",
        "id",
        "kind",
        "seller_id",
        "updated_at",
        "workspace_id",
      ].sort(),
    );
    expect(await enumValues("customer_note_kind")).toEqual([...customerNoteKindValues]);
  });

  it("customer_summary exposes the computed columns", async () => {
    expect(await columnsOf("customer_summary")).toEqual(
      [
        "address_line",
        "average_order_amount_minor",
        "cancelled_order_count",
        "city",
        "completed_order_count",
        "confirmed_order_count",
        "created_at",
        "delivered_order_count",
        "draft_order_count",
        "email",
        "first_order_at",
        "id",
        "last_order_at",
        "lifetime_spend_amount_minor",
        "name",
        "note_count",
        "phone",
        "returned_order_count",
        "risk_note_count",
        "seller_id",
        "shipped_order_count",
        "total_order_count",
        "updated_at",
        "workspace_id",
      ].sort(),
    );
  });

  it("orders.customer_id is NOT NULL", async () => {
    const { rows } = await client.query<{ is_nullable: string }>(
      `select is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'orders' and column_name = 'customer_id'`,
    );
    expect(rows[0].is_nullable).toBe("NO");
  });
});

describe("customer constraints", () => {
  it("rejects a phone that is not normalised", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "ctr-phone");
      await expect(
        client.query(
          `insert into public.customers (workspace_id, seller_id, name, phone, city)
           values ($1, $2, 'A', '0300-1234567', 'Lahore')`,
          [seller.workspaceId, seller.sellerId],
        ),
      ).rejects.toThrow(/customers_phone_normalised/);
    });
  });

  it("rejects an upper-case email", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "ctr-email");
      await expect(
        client.query(
          `insert into public.customers (workspace_id, seller_id, name, phone, email, city)
           values ($1, $2, 'A', '+923001234567', 'Ayesha@Example.com', 'Lahore')`,
          [seller.workspaceId, seller.sellerId],
        ),
      ).rejects.toThrow(/customers_email_lowercase/);
    });
  });

  it("rejects a second customer with the same phone in one workspace", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "ctr-dup");
      const insert = () =>
        client.query(
          `insert into public.customers (workspace_id, seller_id, name, phone, city)
           values ($1, $2, 'A', '+923001234567', 'Lahore')`,
          [seller.workspaceId, seller.sellerId],
        );
      await insert();
      await expect(insert()).rejects.toThrow(/customers_workspace_phone_key/);
    });
  });

  async function insertNoteWithBody(label: string, body: string) {
    const { seller, productId, variantId } = await sellerWithVariant(label);
    const orderId = await draftOrder(seller, productId, variantId);
    const { customer_id } = await customerOf(orderId);

    return client.query(
      `insert into public.customer_notes (customer_id, workspace_id, seller_id, body)
       values ($1, $2, $3, $4)`,
      [customer_id, seller.workspaceId, seller.sellerId, body],
    );
  }

  it("rejects a blank note body", async () => {
    await withRollback(client, async () => {
      await expect(insertNoteWithBody("ctr-note-a", "   ")).rejects.toThrow(
        /customer_notes_body_not_blank/,
      );
    });
  });

  it("rejects a note body over 2000 characters", async () => {
    await withRollback(client, async () => {
      await expect(insertNoteWithBody("ctr-note-b", "x".repeat(2001))).rejects.toThrow(
        /customer_notes_body_max_length/,
      );
    });
  });

  it("customer_id cannot be edited directly", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithVariant("ctr-fk-a");
      const bob = await sellerWithVariant("ctr-fk-b");
      const aliceOrder = await draftOrder(alice.seller, alice.productId, alice.variantId);
      const bobOrder = await draftOrder(bob.seller, bob.productId, bob.variantId);
      const bobCustomer = (await customerOf(bobOrder)).customer_id;

      await expect(
        client.query(`update public.orders set customer_id = $2 where id = $1`, [
          aliceOrder,
          bobCustomer,
        ]),
      ).rejects.toThrow(/customer_id.*cannot be edited/);
    });
  });

  it("customers.phone cannot be edited", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await sellerWithVariant("ctr-phone-edit");
      const orderId = await draftOrder(seller, productId, variantId);
      const { customer_id } = await customerOf(orderId);

      await expect(
        client.query(`update public.customers set phone = '+923009999999' where id = $1`, [
          customer_id,
        ]),
      ).rejects.toThrow(/identity key/);
    });
  });

  it("a customer with orders cannot be deleted", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await sellerWithVariant("ctr-del");
      const orderId = await draftOrder(seller, productId, variantId);
      const { customer_id } = await customerOf(orderId);

      await expect(
        client.query(`delete from public.customers where id = $1`, [customer_id]),
      ).rejects.toThrow(/orders_customer_workspace_fkey/);
    });
  });
});

describe("order -> customer linking", () => {
  it("creates a customer for a new phone and links the order", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await sellerWithVariant("link-new");
      const orderId = await draftOrder(seller, productId, variantId, {
        customerName: "Ayesha Khan",
        customerPhone: "0300-1234567",
        customerCity: "Lahore",
        customerEmail: "Ayesha@Example.com",
      });

      const customer = await customerOf(orderId);
      expect(customer).toMatchObject({
        name: "Ayesha Khan",
        phone: "+923001234567",
        email: "ayesha@example.com",
        city: "Lahore",
        address_line: "House 1, Street 2",
      });

      // The order keeps its own snapshot exactly as typed.
      const { rows } = await client.query(
        `select customer_phone, customer_email from public.orders where id = $1`,
        [orderId],
      );
      expect(rows[0]).toEqual({
        customer_phone: "0300-1234567",
        customer_email: "Ayesha@Example.com",
      });
    });
  });

  it("links a second order with a differently formatted phone to the same customer", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await sellerWithVariant("link-same");
      const first = await draftOrder(seller, productId, variantId, {
        customerPhone: "03001234567",
      });
      const second = await draftOrder(seller, productId, variantId, {
        customerPhone: "+92 300 1234567",
      });
      const third = await draftOrder(seller, productId, variantId, {
        customerPhone: "00923001234567",
      });

      const ids = new Set([
        (await customerOf(first)).customer_id,
        (await customerOf(second)).customer_id,
        (await customerOf(third)).customer_id,
      ]);
      expect(ids.size).toBe(1);

      const { rows } = await client.query(
        `select count(*)::int as n from public.customers where workspace_id = $1`,
        [seller.workspaceId],
      );
      expect(rows[0].n).toBe(1);
    });
  });

  it("different phones are different customers", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await sellerWithVariant("link-diff");
      const first = await draftOrder(seller, productId, variantId, {
        customerPhone: "03001234567",
      });
      const second = await draftOrder(seller, productId, variantId, {
        customerPhone: "03011234567",
      });
      expect((await customerOf(first)).customer_id).not.toBe(
        (await customerOf(second)).customer_id,
      );
    });
  });

  it("the same phone under two sellers is two customers", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithVariant("link-seller-a");
      const bob = await sellerWithVariant("link-seller-b");
      const aliceOrder = await draftOrder(alice.seller, alice.productId, alice.variantId, {
        customerPhone: "03001234567",
      });
      const bobOrder = await draftOrder(bob.seller, bob.productId, bob.variantId, {
        customerPhone: "0300 1234567",
      });

      const a = await customerOf(aliceOrder);
      const b = await customerOf(bobOrder);
      expect(a.customer_id).not.toBe(b.customer_id);
      expect(a.phone).toBe(b.phone);
    });
  });

  it("refreshes latest-known details and keeps email/address when a later order lacks them", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await sellerWithVariant("link-latest");
      const first = await draftOrder(seller, productId, variantId, {
        customerName: "Ayesha",
        customerCity: "Lahore",
        customerEmail: "ayesha@example.com",
        customerAddressLine: "Old address",
      });
      const second = await insertOrder(client, seller, {
        customerName: "Ayesha Khan",
        customerCity: "Karachi",
        customerEmail: null,
        customerAddressLine: null,
      });
      await insertOrderItem(client, seller, second, productId, variantId);

      expect((await customerOf(first)).customer_id).toBe(
        (await customerOf(second)).customer_id,
      );
      expect(await customerOf(second)).toMatchObject({
        name: "Ayesha Khan",
        city: "Karachi",
        email: "ayesha@example.com",
        address_line: "Old address",
      });
    });
  });

  it("ignores a caller-supplied customer_id", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithVariant("link-ignore-a");
      const bob = await sellerWithVariant("link-ignore-b");
      const bobOrder = await draftOrder(bob.seller, bob.productId, bob.variantId);
      const bobCustomer = (await customerOf(bobOrder)).customer_id;

      const {
        rows: [order],
      } = await client.query<{ id: string }>(
        `insert into public.orders
           (workspace_id, seller_id, customer_id, customer_name, customer_phone,
            customer_city, subtotal_amount_minor, total_amount_minor)
         values ($1, $2, $3, 'A', '+923009998877', 'Lahore', 100, 100)
         returning id`,
        [alice.seller.workspaceId, alice.seller.sellerId, bobCustomer],
      );
      const linked = await customerOf(order.id);
      expect(linked.customer_id).not.toBe(bobCustomer);
      expect(linked.phone).toBe("+923009998877");
    });
  });

  it("refuses a new order whose phone has no digits", async () => {
    await withRollback(client, async () => {
      const { seller } = await sellerWithVariant("link-junk");
      await expect(insertOrder(client, seller, { customerPhone: "n/a n/a" })).rejects.toThrow(
        /must contain digits/,
      );
    });
  });

  it("refuses changing an order's phone to one with no digits", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await sellerWithVariant("link-junk-upd");
      const orderId = await draftOrder(seller, productId, variantId);
      await expect(
        client.query(`update public.orders set customer_phone = 'unknown' where id = $1`, [
          orderId,
        ]),
      ).rejects.toThrow(/must contain digits/);
    });
  });

  it("does not match by email: a shared email with a different phone is a different customer", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await sellerWithVariant("link-email");
      const first = await draftOrder(seller, productId, variantId, {
        customerPhone: "03001234567",
        customerEmail: "ayesha@example.com",
      });
      const second = await draftOrder(seller, productId, variantId, {
        customerPhone: "03451112222",
        customerEmail: "ayesha@example.com",
      });
      expect((await customerOf(second)).customer_id).not.toBe(
        (await customerOf(first)).customer_id,
      );
    });
  });

  it("editing an old order does not change the customer's details", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await sellerWithVariant("link-old-edit");
      const old = await draftOrder(seller, productId, variantId, {
        customerName: "Ayesha",
        customerCity: "Lahore",
        customerPhone: "03001234567",
      });
      const latest = await draftOrder(seller, productId, variantId, {
        customerName: "Ayesha Khan",
        customerCity: "Karachi",
        customerEmail: "new@example.com",
        customerPhone: "0300 1234567",
      });
      const before = await customerOf(latest);

      // Edit the old order: new snapshot values, same phone in another format.
      await client.query(
        `update public.orders
         set customer_name = 'Old Name', customer_city = 'Quetta',
             customer_email = 'old@example.com', customer_phone = '+92 300 1234567'
         where id = $1`,
        [old],
      );

      expect(await customerOf(old)).toEqual(before);
      expect(await customerOf(latest)).toEqual(before);
    });
  });

  it("a phone typo fix re-links the order and deletes the orphaned customer", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await sellerWithVariant("link-typo");
      const orderId = await draftOrder(seller, productId, variantId, {
        customerName: "Ayesha",
        customerPhone: "03001234567",
      });
      const typoCustomer = (await customerOf(orderId)).customer_id;

      await client.query(
        `update public.orders set customer_phone = '03001234568' where id = $1`,
        [orderId],
      );

      const after = await customerOf(orderId);
      expect(after.customer_id).not.toBe(typoCustomer);
      expect(after).toMatchObject({ phone: "+923001234568", name: "Ayesha" });

      const { rows } = await client.query(
        `select id from public.customers where workspace_id = $1`,
        [seller.workspaceId],
      );
      expect(rows.map((row) => row.id)).toEqual([after.customer_id]);
    });
  });

  it("re-linking onto an existing customer leaves that customer's details alone", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await sellerWithVariant("link-merge");
      const existing = await draftOrder(seller, productId, variantId, {
        customerName: "Real Name",
        customerCity: "Karachi",
        customerPhone: "03451112222",
      });
      const typo = await draftOrder(seller, productId, variantId, {
        customerName: "Typo Name",
        customerCity: "Lahore",
        customerPhone: "03451112223",
      });

      await client.query(
        `update public.orders set customer_phone = '0345-1112222' where id = $1`,
        [typo],
      );

      expect((await customerOf(typo)).customer_id).toBe((await customerOf(existing)).customer_id);
      expect(await customerOf(typo)).toMatchObject({ name: "Real Name", city: "Karachi" });
      const { rows } = await client.query(
        `select count(*)::int as n from public.customers where workspace_id = $1`,
        [seller.workspaceId],
      );
      expect(rows[0].n).toBe(1);
    });
  });

  it("keeps the previous customer after a re-link when it still has other orders", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await sellerWithVariant("link-keep-orders");
      const a = await draftOrder(seller, productId, variantId, { customerPhone: "03001234567" });
      const b = await draftOrder(seller, productId, variantId, { customerPhone: "03001234567" });
      const shared = (await customerOf(a)).customer_id;

      await client.query(`update public.orders set customer_phone = '03009999999' where id = $1`, [
        b,
      ]);

      expect((await customerOf(a)).customer_id).toBe(shared);
      expect((await customerOf(b)).customer_id).not.toBe(shared);
    });
  });

  it("keeps the previous customer after a re-link when it has notes", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await sellerWithVariant("link-keep-notes");
      const orderId = await draftOrder(seller, productId, variantId, {
        customerPhone: "03001234567",
      });
      const previous = (await customerOf(orderId)).customer_id;
      await client.query(
        `insert into public.customer_notes (customer_id, workspace_id, seller_id, kind, body)
         values ($1, $2, $3, 'risk', 'refused delivery')`,
        [previous, seller.workspaceId, seller.sellerId],
      );

      await client.query(`update public.orders set customer_phone = '03009999999' where id = $1`, [
        orderId,
      ]);

      const { rows } = await client.query(`select id from public.customers where id = $1`, [
        previous,
      ]);
      expect(rows).toHaveLength(1);
    });
  });

  it("works when the order is created through create_draft_order", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await sellerWithVariant("link-rpc");
      const payload = {
        workspace_id: seller.workspaceId,
        seller_id: seller.sellerId,
        performed_by: seller.userId,
        customer_name: "Sana",
        customer_phone: "0321 5551212",
        customer_city: "Multan",
        subtotal_amount_minor: 100000,
        total_amount_minor: 100000,
        items: [
          {
            product_id: productId,
            variant_id: variantId,
            title: "Kurta",
            quantity: 1,
            unit_price_amount_minor: 100000,
            line_total_amount_minor: 100000,
          },
        ],
      };

      const orderId = await asUser(client, seller.userId, async () => {
        const { rows } = await client.query<{ id: string }>(
          `select public.create_draft_order($1::jsonb) as id`,
          [JSON.stringify(payload)],
        );
        return rows[0].id;
      });

      expect(await customerOf(orderId)).toMatchObject({
        name: "Sana",
        phone: "+923215551212",
      });
    });
  });
});

describe("customer_summary", () => {
  it("is all zeros for a customer with only a draft", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await sellerWithVariant("sum-draft");
      const orderId = await draftOrder(seller, productId, variantId);
      const summary = await summaryOf((await customerOf(orderId)).customer_id);

      expect(summary).toMatchObject({
        total_order_count: 1,
        completed_order_count: 0,
        lifetime_spend_amount_minor: "0",
        average_order_amount_minor: null,
        draft_order_count: 1,
        note_count: 0,
        risk_note_count: 0,
      });
    });
  });

  it("counts only confirmed, shipped and delivered orders toward spend", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await sellerWithVariant("sum-spend");
      const confirmed = await draftOrder(
        seller,
        productId,
        variantId,
        { customerPhone: "03001234567" },
        100000,
      );
      const cancelled = await draftOrder(
        seller,
        productId,
        variantId,
        { customerPhone: "0300 1234567" },
        300000,
      );
      const stillDraft = await draftOrder(
        seller,
        productId,
        variantId,
        { customerPhone: "+923001234567" },
        500000,
      );
      const customerId = (await customerOf(confirmed)).customer_id;

      expect((await summaryOf(customerId)).lifetime_spend_amount_minor).toBe("0");

      await transition(seller, confirmed, "confirmed");
      let summary = await summaryOf(customerId);
      expect(summary).toMatchObject({
        total_order_count: 3,
        completed_order_count: 1,
        lifetime_spend_amount_minor: "100000",
        average_order_amount_minor: "100000",
        confirmed_order_count: 1,
        draft_order_count: 2,
      });

      await transition(seller, cancelled, "cancelled");
      summary = await summaryOf(customerId);
      expect(summary).toMatchObject({
        lifetime_spend_amount_minor: "100000",
        cancelled_order_count: 1,
        draft_order_count: 1,
        total_order_count: 3,
      });

      await transition(seller, stillDraft, "confirmed");
      summary = await summaryOf(customerId);
      expect(summary).toMatchObject({
        completed_order_count: 2,
        lifetime_spend_amount_minor: "600000",
        average_order_amount_minor: "300000",
      });
      expect(summary.first_order_at).not.toBeNull();
      expect(summary.last_order_at).not.toBeNull();
    });
  });

  it("counts notes and risk notes", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await sellerWithVariant("sum-notes");
      const orderId = await draftOrder(seller, productId, variantId);
      const customerId = (await customerOf(orderId)).customer_id;

      for (const kind of ["note", "risk", "risk"]) {
        await client.query(
          `insert into public.customer_notes (customer_id, workspace_id, seller_id, kind, body)
           values ($1, $2, $3, $4, 'x')`,
          [customerId, seller.workspaceId, seller.sellerId, kind],
        );
      }

      expect(await summaryOf(customerId)).toMatchObject({
        note_count: 3,
        risk_note_count: 2,
      });
    });
  });

  it("does not mix two customers' orders", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await sellerWithVariant("sum-split");
      const a = await draftOrder(
        seller,
        productId,
        variantId,
        { customerPhone: "03001234567" },
        100000,
      );
      const b = await draftOrder(
        seller,
        productId,
        variantId,
        { customerPhone: "03451112222" },
        900000,
      );
      await transition(seller, a, "confirmed");
      await transition(seller, b, "confirmed");

      expect(
        (await summaryOf((await customerOf(a)).customer_id)).lifetime_spend_amount_minor,
      ).toBe("100000");
      expect(
        (await summaryOf((await customerOf(b)).customer_id)).lifetime_spend_amount_minor,
      ).toBe("900000");
    });
  });
});

describe("backfill of legacy orders", () => {
  it("links legacy orders by normalised phone and gives a no-digit phone its own customer", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await sellerWithVariant("backfill");

      // Recreate the pre-migration shape: no link, no phone rule, no trigger.
      await client.query(`alter table public.orders disable trigger orders_link_customer`);
      await client.query(`alter table public.orders alter column customer_id drop not null`);
      await client.query(
        `alter table public.orders drop constraint orders_customer_phone_has_digits`,
      );

      const legacy = async (phone: string, name: string, createdAt: string) => {
        const {
          rows: [order],
        } = await client.query<{ id: string }>(
          `insert into public.orders
             (workspace_id, seller_id, customer_name, customer_phone, customer_city,
              customer_email, subtotal_amount_minor, total_amount_minor, created_at)
           values ($1, $2, $3, $4, 'Lahore', $5, 100, 100, $6) returning id`,
          [
            seller.workspaceId,
            seller.sellerId,
            name,
            phone,
            name === "Latest" ? "latest@example.com" : null,
            createdAt,
          ],
        );
        await insertOrderItem(client, seller, order.id, productId, variantId, {
          unitPrice: 100,
        });
        return order.id;
      };

      const first = await legacy("0300-1234567", "Early", "2026-01-01T00:00:00Z");
      const second = await legacy("+92 300 1234567", "Latest", "2026-02-01T00:00:00Z");
      const junkA = await legacy("n/a n/a", "Junk A", "2026-01-01T00:00:00Z");
      const junkB = await legacy("n/a n/a", "Junk B", "2026-01-02T00:00:00Z");

      const migration = readFileSync(
        join(__dirname, "../../../../supabase/migrations/20261114190000_customers_and_order_linking.sql"),
        "utf8",
      );
      const block = migration.slice(
        migration.indexOf("-- BACKFILL BEGIN"),
        migration.indexOf("-- BACKFILL END"),
      );
      expect(block).toContain("insert into public.customers");
      await client.query(block);

      const link = async (id: string) =>
        (
          await client.query(
            `select c.id, c.name, c.phone, c.email from public.orders o
             join public.customers c on c.id = o.customer_id where o.id = $1`,
            [id],
          )
        ).rows[0];

      const a = await link(first);
      const b = await link(second);
      expect(a.id).toBe(b.id);
      // Latest order's name; its email.
      expect(a).toMatchObject({ phone: "+923001234567", name: "Latest", email: "latest@example.com" });

      const ja = await link(junkA);
      const jb = await link(junkB);
      expect(ja.id).not.toBe(jb.id);
      expect(ja.phone).toBe(`order:${junkA}`);
      expect(jb.phone).toBe(`order:${junkB}`);

      // Running it again changes nothing.
      await client.query(block);
      const { rows } = await client.query(
        `select count(*)::int as n from public.customers where workspace_id = $1`,
        [seller.workspaceId],
      );
      expect(rows[0].n).toBe(3);
    });
  });
});

describe("copilot mutateDatabase guards", () => {
  const mutation = (sql: string) =>
    client.query<{ result: { rows_affected: number } }>(
      `select public.run_guarded_mutation($1) as result`,
      [sql],
    );

  it("cannot write customers", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await sellerWithVariant("cop-customers");
      const orderId = await draftOrder(seller, productId, variantId);
      const { customer_id } = await customerOf(orderId);

      await expect(
        asUser(client, seller.userId, () =>
          mutation(`update public.customers set name = 'Hacked' where id = '${customer_id}'`),
        ),
      ).rejects.toThrow(/copilot_mutation_refused/);
    });
  });

  it("can still write customer notes", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await sellerWithVariant("cop-notes");
      const orderId = await draftOrder(seller, productId, variantId);
      const { customer_id } = await customerOf(orderId);

      const { rows } = await asUser(client, seller.userId, () =>
        mutation(
          `insert into public.customer_notes (customer_id, workspace_id, seller_id, kind, body)
           values ('${customer_id}', '${seller.workspaceId}', '${seller.sellerId}', 'risk', 'Refused delivery')`,
        ),
      );
      expect(rows[0].result.rows_affected).toBe(1);
    });
  });
});
