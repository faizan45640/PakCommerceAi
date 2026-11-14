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
  return { seller, productId, orderId };
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
      const { seller, orderId } = await draftOrder("ro-transition");

      await expect(
        asUser(client, seller.userId, () =>
          readonly(
            `select public.transition_order_status('${orderId}', '${seller.workspaceId}', 'cancelled')`,
          ),
        ),
      ).rejects.toThrow(/read-only transaction/i);
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
});
