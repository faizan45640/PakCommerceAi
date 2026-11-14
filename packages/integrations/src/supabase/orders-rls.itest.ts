/**
 * Tier 2 — tenant isolation for orders, order_items, and order_status_history.
 *
 * Every case checks the boundary from the outside — what seller A can actually
 * do to seller B's rows — rather than inspecting policy definitions.
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

async function sellerWithOrder(label: string) {
  const seller: Seller = await createSeller(client, label);
  const productId = await insertProduct(client, seller, `${label}-kurta`);
  const variantId = await insertVariant(client, seller, productId, {
    sku: `${label}-1`,
  });
  const orderId = await insertOrder(client, seller);
  const itemId = await insertOrderItem(
    client,
    seller,
    orderId,
    productId,
    variantId,
  );
  const historyId = await insertOrderStatusHistory(client, seller, orderId);

  return { seller, productId, variantId, orderId, itemId, historyId };
}

describe("orders isolation", () => {
  it("seller reads only their own orders", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithOrder("alice");
      await sellerWithOrder("bob");

      const rows = await asUser(client, alice.seller.userId, async () => {
        const result = await client.query<{ id: string }>(
          `select id from public.orders`,
        );
        return result.rows;
      });

      expect(rows.map((row) => row.id)).toEqual([alice.orderId]);
    });
  });

  it("seller can insert an order for their own workspace", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithOrder("alice");

      const orderId = await asUser(client, alice.seller.userId, () =>
        insertOrder(client, alice.seller, { customerName: "Alice Buyer" }),
      );

      expect(orderId).toBeTruthy();
    });
  });

  it("seller cannot insert an order for another seller", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithOrder("alice");
      const bob = await sellerWithOrder("bob");

      await expect(
        asUser(client, alice.seller.userId, () =>
          insertOrder(client, bob.seller, {
            sellerId: bob.seller.sellerId,
            workspaceId: bob.seller.workspaceId,
          }),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it("seller cannot update another seller's order", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithOrder("alice");
      const bob = await sellerWithOrder("bob");

      const updated = await asUser(client, alice.seller.userId, async () => {
        const result = await client.query(
          `update public.orders set note = 'hijack' where id = $1`,
          [bob.orderId],
        );
        return result.rowCount;
      });

      expect(updated).toBe(0);
    });
  });

  it("seller cannot delete another seller's order", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithOrder("alice");
      const bob = await sellerWithOrder("bob");

      const deleted = await asUser(client, alice.seller.userId, async () => {
        const result = await client.query(
          `delete from public.orders where id = $1`,
          [bob.orderId],
        );
        return result.rowCount;
      });

      expect(deleted).toBe(0);
    });
  });
});

describe("order_items isolation", () => {
  it("seller reads only their own order items", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithOrder("alice");
      await sellerWithOrder("bob");

      const rows = await asUser(client, alice.seller.userId, async () => {
        const result = await client.query<{ id: string }>(
          `select id from public.order_items`,
        );
        return result.rows;
      });

      expect(rows.map((row) => row.id)).toEqual([alice.itemId]);
    });
  });

  it("seller cannot insert an item onto another seller's order", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithOrder("alice");
      const bob = await sellerWithOrder("bob");

      await expect(
        asUser(client, alice.seller.userId, () =>
          insertOrderItem(
            client,
            bob.seller,
            bob.orderId,
            bob.productId,
            bob.variantId,
            { sellerId: bob.seller.sellerId, workspaceId: bob.seller.workspaceId },
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });
});

describe("order_status_history isolation", () => {
  it("seller reads only their own history", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithOrder("alice");
      await sellerWithOrder("bob");

      const rows = await asUser(client, alice.seller.userId, async () => {
        const result = await client.query<{ id: string }>(
          `select id from public.order_status_history`,
        );
        return result.rows;
      });

      expect(rows.map((row) => row.id)).toEqual([alice.historyId]);
    });
  });

  it("seller can cancel their own draft through transition_order_status", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithOrder("alice");

      const historyId = await asUser(client, alice.seller.userId, async () => {
        const result = await client.query<{ transition_order_status: string }>(
          `select public.transition_order_status($1, $2, 'cancelled', 'buyer cancelled')`,
          [alice.orderId, alice.seller.workspaceId],
        );
        return result.rows[0]?.transition_order_status;
      });

      expect(historyId).toBeTruthy();

      const status = await client.query<{ status: string }>(
        `select status from public.orders where id = $1`,
        [alice.orderId],
      );
      expect(status.rows[0]?.status).toBe("cancelled");
    });
  });

  it("seller cannot append history for another seller", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithOrder("alice");
      const bob = await sellerWithOrder("bob");

      await expect(
        asUser(client, alice.seller.userId, () =>
          insertOrderStatusHistory(client, bob.seller, bob.orderId, {
            performedBy: alice.seller.userId,
          }),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it("seller cannot update a history row", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithOrder("alice");

      await expect(
        asUser(client, alice.seller.userId, async () => {
          await client.query(
            `update public.order_status_history set note = 'tamper' where id = $1`,
            [alice.historyId],
          );
        }),
      ).rejects.toThrow();
    });
  });
});

describe("anonymous access", () => {
  it("anonymous role cannot read orders", async () => {
    await withRollback(client, async () => {
      await sellerWithOrder("anon-orders");

      await expect(
        asAnon(client, async () => {
          await client.query(`select id from public.orders`);
        }),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it("anonymous role cannot read order items", async () => {
    await withRollback(client, async () => {
      await sellerWithOrder("anon-items");

      await expect(
        asAnon(client, async () => {
          await client.query(`select id from public.order_items`);
        }),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it("anonymous role cannot read order status history", async () => {
    await withRollback(client, async () => {
      await sellerWithOrder("anon-history");

      await expect(
        asAnon(client, async () => {
          await client.query(`select id from public.order_status_history`);
        }),
      ).rejects.toThrow(/permission denied/i);
    });
  });
});
