/**
 * Tier 2 — schema conformance for orders, order_items, and order_status_history.
 *
 * The order contract (packages/shared/src/orders) says what an order looks like.
 * These tests fail the moment storage stops agreeing with it: an enum value
 * added on one side only, a money check dropped, a history row that can be
 * rewritten after the fact.
 *
 * Requires the local Supabase stack: `npx supabase start`.
 */

import {
  orderChannelValues,
  orderPaymentMethodValues,
  orderStatusValues,
} from "@pakcommerce/shared";
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

async function columnsOf(table: string): Promise<string[]> {
  const { rows } = await client.query<{ column_name: string }>(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = $1
     order by column_name`,
    [table],
  );

  return rows.map((row) => row.column_name);
}

async function enumValues(name: string): Promise<string[]> {
  const { rows } = await client.query<{ value: string }>(
    `select e.enumlabel as value
     from pg_type t
     join pg_enum e on e.enumtypid = t.oid
     where t.typname = $1
     order by e.enumsortorder`,
    [name],
  );

  return rows.map((row) => row.value);
}

describe("table shape", () => {
  it("orders table exists with contract columns", async () => {
    expect(await columnsOf("orders")).toEqual(
      [
        "cancelled_at",
        "channel",
        "confirmed_at",
        "created_at",
        "currency",
        "customer_address_line",
        "customer_city",
        "customer_email",
        "customer_id",
        "customer_name",
        "customer_phone",
        "id",
        "note",
        "payment_method",
        "seller_id",
        "shipping_fee_amount_minor",
        "status",
        "subtotal_amount_minor",
        "total_amount_minor",
        "updated_at",
        "workspace_id",
      ].sort(),
    );
  });

  it("order_items table exists with contract columns", async () => {
    expect(await columnsOf("order_items")).toEqual(
      [
        "created_at",
        "currency",
        "id",
        "line_total_amount_minor",
        "order_id",
        "product_id",
        "quantity",
        "seller_id",
        "sku",
        "title",
        "unit_price_amount_minor",
        "updated_at",
        "variant_id",
        "variant_title",
        "workspace_id",
      ].sort(),
    );
  });

  it("order_status_history table exists with contract columns", async () => {
    expect(await columnsOf("order_status_history")).toEqual(
      [
        "created_at",
        "from_status",
        "id",
        "note",
        "order_id",
        "performed_by",
        "seller_id",
        "to_status",
        "workspace_id",
      ].sort(),
    );
  });

  it("order enums match the shared contract", async () => {
    expect(await enumValues("order_status")).toEqual([...orderStatusValues]);
    expect(await enumValues("order_channel")).toEqual([...orderChannelValues]);
    expect(await enumValues("order_payment_method")).toEqual([
      ...orderPaymentMethodValues,
    ]);
  });
});

describe("draft order inserts", () => {
  it("accepts a draft order with a line item and initial history", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "order-draft-ok");
      const productId = await insertProduct(client, seller, "kurta");
      const variantId = await insertVariant(client, seller, productId);

      const orderId = await insertOrder(client, seller);
      const itemId = await insertOrderItem(
        client,
        seller,
        orderId,
        productId,
        variantId,
      );
      const historyId = await insertOrderStatusHistory(client, seller, orderId);

      expect(orderId).toBeTruthy();
      expect(itemId).toBeTruthy();
      expect(historyId).toBeTruthy();
    });
  });
});

describe("orders guards", () => {
  it("rejects a total that does not equal subtotal plus shipping", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "order-bad-total");

      await expect(
        insertOrder(client, seller, { subtotal: 100, shippingFee: 50, total: 200 }),
      ).rejects.toThrow(/orders_total_matches_parts/);
    });
  });

  it("rejects a negative subtotal", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "order-neg-subtotal");

      await expect(
        insertOrder(client, seller, { subtotal: -1, shippingFee: 0, total: -1 }),
      ).rejects.toThrow(/orders_subtotal_non_negative/);
    });
  });

  it("rejects a draft with confirmed_at set", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "order-draft-confirmed");

      await expect(
        insertOrder(client, seller, {
          status: "draft",
          confirmedAt: new Date().toISOString(),
        }),
      ).rejects.toThrow(/orders_draft_has_no_confirmed_at/);
    });
  });

  it("rejects a confirmed order without confirmed_at", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "order-confirmed-nostamp");

      await expect(
        insertOrder(client, seller, {
          status: "confirmed",
          customerAddressLine: "House 1, Street 2",
          confirmedAt: null,
        }),
      ).rejects.toThrow(/orders_confirmed_path_requires_stamp/);
    });
  });

  it("rejects a confirmed order without an address", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "order-confirmed-noaddr");

      await expect(
        insertOrder(client, seller, {
          status: "confirmed",
          confirmedAt: new Date().toISOString(),
          customerAddressLine: null,
        }),
      ).rejects.toThrow(/orders_confirmed_path_requires_address/);
    });
  });
});

describe("order_items guards", () => {
  it("rejects a non-positive quantity", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "item-qty");
      const productId = await insertProduct(client, seller, "kurta");
      const variantId = await insertVariant(client, seller, productId);
      const orderId = await insertOrder(client, seller);

      await expect(
        insertOrderItem(client, seller, orderId, productId, variantId, {
          quantity: 0,
          lineTotal: 0,
        }),
      ).rejects.toThrow(/order_items_quantity_positive/);
    });
  });

  it("rejects a line total that does not match quantity times unit price", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "item-line-total");
      const productId = await insertProduct(client, seller, "kurta");
      const variantId = await insertVariant(client, seller, productId);
      const orderId = await insertOrder(client, seller);

      await expect(
        insertOrderItem(client, seller, orderId, productId, variantId, {
          quantity: 2,
          unitPrice: 100,
          lineTotal: 150,
        }),
      ).rejects.toThrow(/order_items_line_total_matches/);
    });
  });
});

describe("order_status_history guards", () => {
  it("rejects an initial history row that is not draft", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "history-init");
      const orderId = await insertOrder(client, seller);

      await expect(
        insertOrderStatusHistory(client, seller, orderId, {
          fromStatus: null,
          toStatus: "confirmed",
        }),
      ).rejects.toThrow(/order_status_history_transition_legal/);
    });
  });

  it("rejects an illegal transition such as draft to shipped", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "history-illegal");
      const orderId = await insertOrder(client, seller);
      await insertOrderStatusHistory(client, seller, orderId);

      await expect(
        insertOrderStatusHistory(client, seller, orderId, {
          fromStatus: "draft",
          toStatus: "shipped",
        }),
      ).rejects.toThrow(/order_status_history_transition_legal/);
    });
  });

  it("refuses raw status updates without the lifecycle gate", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "history-raw-status");
      const orderId = await insertOrder(client, seller);
      await insertOrderStatusHistory(client, seller, orderId);

      await expect(
        client.query(
          `update public.orders
           set status = 'confirmed',
               confirmed_at = now(),
               customer_address_line = 'House 1'
           where id = $1`,
          [orderId],
        ),
      ).rejects.toThrow(/transition_order_status/i);
    });
  });

  it("transition_order_status confirms with stock when address and qty allow", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "history-confirm-ok");
      const productId = await insertProduct(client, seller, "kurta");
      const variantId = await insertVariant(client, seller, productId, {
        quantity: 5,
      });
      const orderId = await insertOrder(client, seller, {
        customerAddressLine: "House 1, Street 2",
      });
      await insertOrderItem(client, seller, orderId, productId, variantId);
      await insertOrderStatusHistory(client, seller, orderId);

      await asUser(client, seller.userId, () =>
        client.query(
          `select public.transition_order_status($1, $2, 'confirmed', null)`,
          [orderId, seller.workspaceId],
        ),
      );

      const status = await client.query<{ status: string }>(
        `select status from public.orders where id = $1`,
        [orderId],
      );
      expect(status.rows[0]?.status).toBe("confirmed");
    });
  });

  it("refuses UPDATE on a history row", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "history-update");
      const orderId = await insertOrder(client, seller);
      const historyId = await insertOrderStatusHistory(client, seller, orderId);

      await expect(
        client.query(
          `update public.order_status_history set note = 'tamper' where id = $1`,
          [historyId],
        ),
      ).rejects.toThrow(/append-only/i);
    });
  });
});
