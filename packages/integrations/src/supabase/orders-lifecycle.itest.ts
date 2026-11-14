/**
 * Tier 2 — order lifecycle invariants (status gate, freeze, money, PKR).
 *
 * These are the holes that would let confirmation/stock (T-037) be bypassed
 * or let header money drift from line items.
 *
 * Requires the local Supabase stack: `npx supabase start`.
 */

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
  withRollback,
} from "./testing/database.js";

let client: Client;

beforeAll(async () => {
  client = await connect();
});

afterAll(async () => {
  await client?.end();
});

async function draftWithItem(label: string) {
  const seller = await createSeller(client, label);
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
  await insertOrderStatusHistory(client, seller, orderId);
  return { seller, productId, variantId, orderId, itemId };
}

describe("order lifecycle gate", () => {
  it("rejects direct status updates", async () => {
    await withRollback(client, async () => {
      const { orderId } = await draftWithItem("gate-status");

      await expect(
        client.query(
          `update public.orders
           set status = 'shipped',
               confirmed_at = now(),
               customer_address_line = 'x'
           where id = $1`,
          [orderId],
        ),
      ).rejects.toThrow(/transition_order_status/i);
    });
  });

  it("rejects non-draft inserts without the gate", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "gate-insert");

      await expect(
        client.query(
          `insert into public.orders
             (workspace_id, seller_id, status, customer_name, customer_phone,
              customer_city, customer_address_line, subtotal_amount_minor,
              shipping_fee_amount_minor, total_amount_minor, confirmed_at)
           values ($1, $2, 'confirmed', 'A', '+92300', 'Lahore', 'Addr',
                   100, 0, 100, now())`,
          [seller.workspaceId, seller.sellerId],
        ),
      ).rejects.toThrow(/inserted as draft/i);
    });
  });

  it("rejects orphan transition history without the gate", async () => {
    await withRollback(client, async () => {
      const { seller, orderId } = await draftWithItem("gate-history");

      await expect(
        client.query(
          `insert into public.order_status_history
             (order_id, workspace_id, seller_id, from_status, to_status, performed_by)
           values ($1, $2, $3, 'draft', 'cancelled', $4)`,
          [orderId, seller.workspaceId, seller.sellerId, seller.userId],
        ),
      ).rejects.toThrow(/transition_order_status/i);
    });
  });

  it("cancels a draft atomically", async () => {
    await withRollback(client, async () => {
      const cancellable = await draftWithItem("gate-cancel");

      await asUser(client, cancellable.seller.userId, async () => {
        await client.query(
          `select public.transition_order_status($1, $2, 'cancelled', null)`,
          [cancellable.orderId, cancellable.seller.workspaceId],
        );
      });

      const cancelled = await client.query<{ status: string }>(
        `select status from public.orders where id = $1`,
        [cancellable.orderId],
      );
      expect(cancelled.rows[0]?.status).toBe("cancelled");
    });
  });

  it("confirms a draft, deducts stock, and writes a sale movement", async () => {
    await withRollback(client, async () => {
      const confirmable = await draftWithItem("gate-confirm");

      await client.query(
        `update public.orders
         set customer_address_line = 'House 1, Street 2'
         where id = $1`,
        [confirmable.orderId],
      );
      await client.query(
        `update public.product_variants
         set quantity_on_hand = 10, reserved_quantity = 0, track_inventory = true
         where id = $1`,
        [confirmable.variantId],
      );

      await asUser(client, confirmable.seller.userId, async () => {
        await client.query(
          `select public.transition_order_status($1, $2, 'confirmed', null)`,
          [confirmable.orderId, confirmable.seller.workspaceId],
        );
      });

      const order = await client.query<{ status: string }>(
        `select status from public.orders where id = $1`,
        [confirmable.orderId],
      );
      expect(order.rows[0]?.status).toBe("confirmed");

      const variant = await client.query<{ quantity_on_hand: number }>(
        `select quantity_on_hand from public.product_variants where id = $1`,
        [confirmable.variantId],
      );
      // draftWithItem inserts quantity 1 by default
      expect(variant.rows[0]?.quantity_on_hand).toBe(9);

      const movements = await client.query<{ reason: string; quantity_delta: number }>(
        `select reason, quantity_delta from public.stock_movements
         where variant_id = $1 order by created_at desc`,
        [confirmable.variantId],
      );
      expect(movements.rows[0]).toMatchObject({
        reason: "sale",
        quantity_delta: -1,
      });
    });
  });

  it("refuses confirm when available stock is insufficient", async () => {
    await withRollback(client, async () => {
      const confirmable = await draftWithItem("gate-oos");

      await client.query(
        `update public.orders
         set customer_address_line = 'House 1'
         where id = $1`,
        [confirmable.orderId],
      );
      await client.query(
        `update public.product_variants
         set quantity_on_hand = 0, reserved_quantity = 0, track_inventory = true
         where id = $1`,
        [confirmable.variantId],
      );

      // Exception aborts the withRollback transaction, so we only assert the
      // refusal token here — a follow-up SELECT would hit 25P02.
      await expect(
        asUser(client, confirmable.seller.userId, () =>
          client.query(
            `select public.transition_order_status($1, $2, 'confirmed', null)`,
            [confirmable.orderId, confirmable.seller.workspaceId],
          ),
        ),
      ).rejects.toThrow(/insufficient_stock/);
    });
  });
});

describe("order item freeze and money integrity", () => {
  it("freezes line items after cancel", async () => {
    await withRollback(client, async () => {
      const { seller, orderId, itemId } = await draftWithItem("freeze-item");

      await asUser(client, seller.userId, async () => {
        await client.query(
          `select public.transition_order_status($1, $2, 'cancelled', null)`,
          [orderId, seller.workspaceId],
        );
      });

      await expect(
        client.query(
          `update public.order_items set quantity = 9, line_total_amount_minor = 2250000 where id = $1`,
          [itemId],
        ),
      ).rejects.toThrow(/frozen/i);
    });
  });

  it("rejects a non-PKR currency", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "currency-pkr");

      await expect(
        insertOrder(client, seller, { currency: "USD" }),
      ).rejects.toThrow(/orders_currency_pkr|currency/i);
    });
  });

  it("rejects a header whose subtotal does not match line totals", async () => {
    await withRollback(client, async () => {
      const { orderId } = await draftWithItem("money-mismatch");

      await expect(
        client.query(
          `update public.orders
           set subtotal_amount_minor = 1,
               total_amount_minor = 1
           where id = $1`,
          [orderId],
        ).then(() => client.query(`set constraints all immediate`)),
      ).rejects.toThrow(/subtotal_amount_minor|line totals/i);
    });
  });
});
