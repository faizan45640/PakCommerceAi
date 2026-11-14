/**
 * Copilot SQL guards — run_readonly_query and run_guarded_mutation must not be
 * a side door around the order lifecycle (transition_order_status + triggers).
 *
 * Each attack runs as the seller who owns the order, so RLS would allow it;
 * only the guards stand in the way.
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

async function draftOrder(label: string) {
  const seller = await createSeller(client, label);
  const productId = await insertProduct(client, seller, `${label}-kurta`);
  const variantId = await insertVariant(client, seller, productId, {
    sku: `${label}-1`,
  });
  const orderId = await insertOrder(client, seller);
  await insertOrderItem(client, seller, orderId, productId, variantId);
  await insertOrderStatusHistory(client, seller, orderId);
  return { seller, productId, variantId, orderId };
}

function readonly(sql: string) {
  return client.query<{ result: unknown }>(
    `select public.run_readonly_query($1) as result`,
    [sql],
  );
}

function mutation(sql: string) {
  return client.query<{ result: { rows_affected: number } }>(
    `select public.run_guarded_mutation($1) as result`,
    [sql],
  );
}

describe("run_readonly_query", () => {
  it("still answers a plain select", async () => {
    await withRollback(client, async () => {
      const { seller } = await draftOrder("ro-select");

      const { rows } = await asUser(client, seller.userId, () =>
        readonly(`select count(*)::int as n from public.orders`),
      );

      expect(rows[0].result).toEqual([{ n: 1 }]);
    });
  });

  it("refuses a write hidden inside a function call", async () => {
    await withRollback(client, async () => {
      const { seller, variantId } = await draftOrder("ro-write");

      // adjust_stock is not on the name list, so only the read-only
      // transaction stands between this text and a stock change.
      await expect(
        asUser(client, seller.userId, () =>
          readonly(
            `select public.adjust_stock('${seller.workspaceId}', '${variantId}', 3, 'manual_adjustment', 'probe')`,
          ),
        ),
      ).rejects.toThrow(/read-only transaction/i);
    });
  });

  it("refuses SQL hidden in a string with query_to_xml (identity forgery)", async () => {
    await withRollback(client, async () => {
      const { seller } = await draftOrder("ro-claims");

      await expect(
        asUser(client, seller.userId, () =>
          readonly(
            `select query_to_xml('select set_con' || 'fig(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-000000000000"}'', true)', false, false, '') as x`,
          ),
        ),
      ).rejects.toThrow(/forbidden function or escape/i);
    });
  });

  it("refuses ts_stat, which also runs SQL from a string", async () => {
    await withRollback(client, async () => {
      const { seller } = await draftOrder("ro-tsstat");

      await expect(
        asUser(client, seller.userId, () =>
          readonly(`select * from ts_stat('select to_tsvector(title) from public.products')`),
        ),
      ).rejects.toThrow(/forbidden function or escape/i);
    });
  });
});

describe("run_guarded_mutation", () => {
  it("still applies a plain catalogue update", async () => {
    await withRollback(client, async () => {
      const { seller, productId } = await draftOrder("mu-plain");

      const { rows } = await asUser(client, seller.userId, () =>
        mutation(
          `update public.products set title = 'Free delivery on all orders' where id = '${productId}'`,
        ),
      );

      expect(rows[0].result.rows_affected).toBe(1);
    });
  });

  it("refuses to open the lifecycle gate with set_config", async () => {
    await withRollback(client, async () => {
      const { seller, orderId } = await draftOrder("mu-gate");

      await expect(
        asUser(client, seller.userId, () =>
          mutation(
            `update public.orders o
             set status = 'confirmed', confirmed_at = now(), customer_address_line = 'x'
             from (select set_config('pakcommerce.allow_order_lifecycle_change', 'on', true)) g
             where o.id = '${orderId}'`,
          ),
        ),
      ).rejects.toThrow(/forbidden function or escape/i);
    });
  });

  it("refuses a unicode-escaped identifier", async () => {
    await withRollback(client, async () => {
      const { seller, orderId } = await draftOrder("mu-escape");

      await expect(
        asUser(client, seller.userId, () =>
          mutation(
            `update public.orders o set note = 'x'
             from (select U&"set\\005fconfig"('pakcommerce.allow_order_lifecycle_change', 'on', true)) g
             where o.id = '${orderId}'`,
          ),
        ),
      ).rejects.toThrow(/forbidden function or escape/i);
    });
  });

  it("refuses a direct transition_order_status call", async () => {
    await withRollback(client, async () => {
      const { seller, orderId, productId } = await draftOrder("mu-transition");

      await expect(
        asUser(client, seller.userId, () =>
          mutation(
            `update public.products p set title = p.title
             from (select public.transition_order_status('${orderId}', '${seller.workspaceId}', 'cancelled')) t
             where p.id = '${productId}'`,
          ),
        ),
      ).rejects.toThrow(/forbidden function or escape/i);
    });
  });

  it("refuses a gate opened through query_to_xml string assembly", async () => {
    await withRollback(client, async () => {
      const { seller, orderId } = await draftOrder("mu-xml");

      await expect(
        asUser(client, seller.userId, () =>
          mutation(
            `update public.orders
             set status = 'confirmed', confirmed_at = now(), customer_address_line = 'x'
             where id = '${orderId}'
               and (select query_to_xml('select set_con' || 'fig(''pakcommerce.allow_order_lifecycle_change'', ''on'', true)', false, false, '')) is not null`,
          ),
        ),
      ).rejects.toThrow(/forbidden function or escape/i);
    });
  });

  it("refuses a nested run_readonly_query call", async () => {
    await withRollback(client, async () => {
      const { seller, productId } = await draftOrder("mu-nested");

      await expect(
        asUser(client, seller.userId, () =>
          mutation(
            `update public.products set title = title
             where id = '${productId}' and (select public.run_readonly_query('select 1')) is not null`,
          ),
        ),
      ).rejects.toThrow(/forbidden function or escape/i);
    });
  });
});

describe("run_guarded_mutation cannot edit orders or stock", () => {
  it("refuses an order edit", async () => {
    await withRollback(client, async () => {
      const { seller, orderId } = await draftOrder("mu-order");

      await expect(
        asUser(client, seller.userId, () =>
          mutation(`update public.orders set note = 'x' where id = '${orderId}'`),
        ),
      ).rejects.toThrow(/copilot_mutation_refused: orders/i);
    });
  });

  it("refuses repricing a draft line", async () => {
    await withRollback(client, async () => {
      const { seller, orderId } = await draftOrder("mu-line");

      await expect(
        asUser(client, seller.userId, () =>
          mutation(
            `update public.order_items
             set unit_price_amount_minor = 1, line_total_amount_minor = quantity
             where order_id = '${orderId}'`,
          ),
        ),
      ).rejects.toThrow(/copilot_mutation_refused: order_items/i);
    });
  });

  it("refuses touching stock history", async () => {
    await withRollback(client, async () => {
      const { seller, productId, variantId } = await draftOrder("mu-movements");

      // A seller may record their own movement directly (inventory-rls), so
      // only the copilot flag refuses this one.
      await expect(
        asUser(client, seller.userId, () =>
          mutation(
            `insert into public.stock_movements
               (variant_id, product_id, workspace_id, seller_id, reason,
                quantity_delta, before_quantity_on_hand, after_quantity_on_hand, performed_by)
             values ('${variantId}', '${productId}', '${seller.workspaceId}', '${seller.sellerId}',
                     'purchase', 5, 10, 15, '${seller.userId}')`,
          ),
        ),
      ).rejects.toThrow(/copilot_mutation_refused: stock_movements/i);
    });
  });

  it("refuses setting stock without a movement", async () => {
    await withRollback(client, async () => {
      const { seller, variantId } = await draftOrder("mu-stock");

      await expect(
        asUser(client, seller.userId, () =>
          mutation(`update public.product_variants set quantity_on_hand = 99 where id = '${variantId}'`),
        ),
      ).rejects.toThrow(/stock cannot be changed through mutateDatabase/i);
    });
  });

  it("still changes a variant's price", async () => {
    await withRollback(client, async () => {
      const { seller, variantId } = await draftOrder("mu-price");

      const { rows } = await asUser(client, seller.userId, () =>
        mutation(`update public.product_variants set price_amount_minor = 300000 where id = '${variantId}'`),
      );

      expect(rows[0].result.rows_affected).toBe(1);
    });
  });
});
