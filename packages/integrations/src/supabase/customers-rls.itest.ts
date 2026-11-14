/**
 * Tier 2 - tenant isolation for customers, customer_notes and customer_summary.
 *
 * Every case checks the boundary from the outside: what seller A can actually do
 * to seller B's rows.
 *
 * Requires the local Supabase stack: `npx supabase start`.
 */

import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  asAnon,
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

async function sellerWithCustomer(label: string) {
  const seller: Seller = await createSeller(client, label);
  const productId = await insertProduct(client, seller, `${label}-kurta`);
  const variantId = await insertVariant(client, seller, productId, { sku: `${label}-1` });
  const orderId = await insertOrder(client, seller, { customerAddressLine: "Addr" });
  await insertOrderItem(client, seller, orderId, productId, variantId);
  await insertOrderStatusHistory(client, seller, orderId);

  const {
    rows: [customer],
  } = await client.query<{ id: string }>(
    `select customer_id as id from public.orders where id = $1`,
    [orderId],
  );
  const {
    rows: [note],
  } = await client.query<{ id: string }>(
    `insert into public.customer_notes
       (customer_id, workspace_id, seller_id, kind, body, created_by)
     values ($1, $2, $3, 'risk', 'refused delivery', $4) returning id`,
    [customer.id, seller.workspaceId, seller.sellerId, seller.userId],
  );

  return { seller, orderId, customerId: customer.id, noteId: note.id };
}

describe("customers isolation", () => {
  it("seller reads only their own customers", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithCustomer("alice");
      await sellerWithCustomer("bob");

      const { rows } = await asUser(client, alice.seller.userId, () =>
        client.query(`select id from public.customers`),
      );
      expect(rows.map((row) => row.id)).toEqual([alice.customerId]);
    });
  });

  it("seller cannot insert a customer for another seller", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithCustomer("alice");
      const bob = await sellerWithCustomer("bob");

      await expect(
        asUser(client, alice.seller.userId, () =>
          client.query(
            `insert into public.customers (workspace_id, seller_id, name, phone, city)
             values ($1, $2, 'X', '+923119998877', 'Lahore')`,
            [bob.seller.workspaceId, bob.seller.sellerId],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it("seller cannot insert an order into another seller's workspace (and so cannot create customers there)", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithCustomer("alice");
      const bob = await sellerWithCustomer("bob");

      await expect(
        asUser(client, alice.seller.userId, () =>
          insertOrder(client, bob.seller, {
            sellerId: bob.seller.sellerId,
            workspaceId: bob.seller.workspaceId,
            customerPhone: "03119998877",
          }),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it("seller cannot update another seller's customer", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithCustomer("alice");
      const bob = await sellerWithCustomer("bob");

      const result = await asUser(client, alice.seller.userId, () =>
        client.query(`update public.customers set name = 'Hacked' where id = $1`, [
          bob.customerId,
        ]),
      );
      expect(result.rowCount).toBe(0);

      const { rows } = await client.query(`select name from public.customers where id = $1`, [
        bob.customerId,
      ]);
      expect(rows[0].name).toBe("Test Customer");
    });
  });

  it("seller cannot delete another seller's customer", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithCustomer("alice");
      const bob = await sellerWithCustomer("bob");

      const result = await asUser(client, alice.seller.userId, () =>
        client.query(`delete from public.customers where id = $1`, [bob.customerId]),
      );
      expect(result.rowCount).toBe(0);
    });
  });

  it("anonymous users read nothing", async () => {
    await withRollback(client, async () => {
      await sellerWithCustomer("alice");

      await expect(
        asAnon(client, () => client.query(`select id from public.customers`)),
      ).rejects.toThrow(/permission denied/i);
    });
  });
});

describe("customer_notes isolation", () => {
  it("seller reads only their own notes", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithCustomer("alice");
      await sellerWithCustomer("bob");

      const { rows } = await asUser(client, alice.seller.userId, () =>
        client.query(`select id from public.customer_notes`),
      );
      expect(rows.map((row) => row.id)).toEqual([alice.noteId]);
    });
  });

  it("seller can add and delete a note on their own customer", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithCustomer("alice");

      await asUser(client, alice.seller.userId, async () => {
        const {
          rows: [created],
        } = await client.query<{ id: string }>(
          `insert into public.customer_notes
             (customer_id, workspace_id, seller_id, body, created_by)
           values ($1, $2, $3, 'prefers evening', $3) returning id`,
          [alice.customerId, alice.seller.workspaceId, alice.seller.sellerId],
        );
        const deleted = await client.query(`delete from public.customer_notes where id = $1`, [
          created.id,
        ]);
        expect(deleted.rowCount).toBe(1);
      });
    });
  });

  it("seller cannot add a note to another seller's customer", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithCustomer("alice");
      const bob = await sellerWithCustomer("bob");

      await expect(
        asUser(client, alice.seller.userId, () =>
          client.query(
            `insert into public.customer_notes
               (customer_id, workspace_id, seller_id, body, created_by)
             values ($1, $2, $3, 'spam', $4)`,
            [bob.customerId, bob.seller.workspaceId, bob.seller.sellerId, alice.seller.userId],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it("seller cannot write a note in someone else's name", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithCustomer("alice");
      const bob = await sellerWithCustomer("bob");

      await expect(
        asUser(client, alice.seller.userId, () =>
          client.query(
            `insert into public.customer_notes
               (customer_id, workspace_id, seller_id, body, created_by)
             values ($1, $2, $3, 'forged', $4)`,
            [alice.customerId, alice.seller.workspaceId, alice.seller.sellerId, bob.seller.userId],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it("seller cannot delete another seller's note", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithCustomer("alice");
      const bob = await sellerWithCustomer("bob");

      const result = await asUser(client, alice.seller.userId, () =>
        client.query(`delete from public.customer_notes where id = $1`, [bob.noteId]),
      );
      expect(result.rowCount).toBe(0);
    });
  });

  it("a note cannot point at a customer in another workspace", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithCustomer("alice");
      const bob = await sellerWithCustomer("bob");

      await expect(
        client.query(
          `insert into public.customer_notes (customer_id, workspace_id, seller_id, body)
           values ($1, $2, $3, 'drift')`,
          [bob.customerId, alice.seller.workspaceId, alice.seller.sellerId],
        ),
      ).rejects.toThrow(/customer_notes_customer_workspace_fkey/);
    });
  });

  it("anonymous users read nothing", async () => {
    await withRollback(client, async () => {
      await sellerWithCustomer("alice");

      await expect(
        asAnon(client, () => client.query(`select id from public.customer_notes`)),
      ).rejects.toThrow(/permission denied/i);
    });
  });
});

describe("customer_summary isolation", () => {
  it("seller sees only their own customers in the summary", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithCustomer("alice");
      await sellerWithCustomer("bob");

      const { rows } = await asUser(client, alice.seller.userId, () =>
        client.query(`select id, total_order_count, risk_note_count from public.customer_summary`),
      );
      expect(rows).toEqual([
        { id: alice.customerId, total_order_count: 1, risk_note_count: 1 },
      ]);
    });
  });

  it("seller cannot read another seller's summary row by id", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithCustomer("alice");
      const bob = await sellerWithCustomer("bob");

      const { rows } = await asUser(client, alice.seller.userId, () =>
        client.query(`select id from public.customer_summary where id = $1`, [bob.customerId]),
      );
      expect(rows).toEqual([]);
    });
  });

  it("anonymous users read nothing", async () => {
    await withRollback(client, async () => {
      await sellerWithCustomer("alice");

      await expect(
        asAnon(client, () => client.query(`select id from public.customer_summary`)),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it("the view is not writable", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithCustomer("alice");

      await expect(
        asUser(client, alice.seller.userId, () =>
          client.query(`update public.customer_summary set name = 'x' where id = $1`, [
            alice.customerId,
          ]),
        ),
      ).rejects.toThrow(/permission denied/i);
    });
  });
});
