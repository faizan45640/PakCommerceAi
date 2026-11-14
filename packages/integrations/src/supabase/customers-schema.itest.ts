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

  it("an order cannot point at a customer of another workspace", async () => {
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
      ).rejects.toThrow(/orders_customer_workspace_fkey/);
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

  it("re-links an order when its phone changes", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await sellerWithVariant("link-update");
      const orderId = await draftOrder(seller, productId, variantId, {
        customerPhone: "03001234567",
      });
      const before = (await customerOf(orderId)).customer_id;

      await client.query(
        `update public.orders set customer_phone = '03451112222' where id = $1`,
        [orderId],
      );

      const after = await customerOf(orderId);
      expect(after.customer_id).not.toBe(before);
      expect(after.phone).toBe("+923451112222");
    });
  });

  it("matches by email only when the phone has no digits", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await sellerWithVariant("link-email");
      const first = await draftOrder(seller, productId, variantId, {
        customerPhone: "03001234567",
        customerEmail: "Ayesha@example.com",
      });
      const noPhone = await draftOrder(seller, productId, variantId, {
        customerPhone: "n/a n/a",
        customerEmail: "ayesha@example.com",
      });
      const withPhone = await draftOrder(seller, productId, variantId, {
        customerPhone: "03451112222",
        customerEmail: "ayesha@example.com",
      });

      // Unusable phone + known email -> the existing customer.
      expect((await customerOf(noPhone)).customer_id).toBe(
        (await customerOf(first)).customer_id,
      );
      // A usable phone always wins over a shared email.
      expect((await customerOf(withPhone)).customer_id).not.toBe(
        (await customerOf(first)).customer_id,
      );
    });
  });

  it("keeps an order with an unusable phone and no email", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await sellerWithVariant("link-junk");
      const orderId = await draftOrder(seller, productId, variantId, {
        customerPhone: "unknown",
      });
      expect((await customerOf(orderId)).phone).toBe("unknown");
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
