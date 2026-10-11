/**
 * Tier 2 — the adjust_stock() function.
 *
 * Changing a quantity and recording why are two writes, and supabase-js has no
 * transactions. adjust_stock() does both in one statement, so stock can never
 * move without a movement and a movement can never describe a change that did
 * not happen. These tests check that pairing, the guards that refuse a bad
 * adjustment, and that it all still runs as the calling seller.
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

async function sellerWithVariant(label: string, variant: Record<string, unknown> = {}) {
  const seller: Seller = await createSeller(client, label);
  const productId = await insertProduct(client, seller, `${label}-kurta`);
  const variantId = await insertVariant(client, seller, productId, {
    sku: `${label}-1`,
    ...variant,
  });

  return { seller, productId, variantId };
}

/** Calls adjust_stock() as whoever the connection currently is. */
async function adjustStock(
  workspaceId: string,
  variantId: string,
  target: number,
  reason = "manual_adjustment",
  note: string | null = null,
): Promise<string> {
  const { rows } = await client.query<{ movement_id: string }>(
    `select public.adjust_stock($1, $2, $3, $4::public.stock_movement_reason, $5) as movement_id`,
    [workspaceId, variantId, target, reason, note],
  );

  return rows[0].movement_id;
}

async function quantityOf(variantId: string): Promise<number | null> {
  const { rows } = await client.query<{ quantity_on_hand: number | null }>(
    `select quantity_on_hand from public.product_variants where id = $1`,
    [variantId],
  );

  return rows[0].quantity_on_hand;
}

async function movementCount(variantId: string): Promise<number> {
  const { rows } = await client.query<{ count: string }>(
    `select count(*) from public.stock_movements where variant_id = $1`,
    [variantId],
  );

  return Number(rows[0].count);
}

describe("adjust_stock records what it changes", () => {
  it("sets the new quantity and records the movement together", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithVariant("alice", { quantity: 10 });

      const movementId = await asUser(client, alice.seller.userId, () =>
        adjustStock(alice.seller.workspaceId, alice.variantId, 25, "purchase", "Eid restock"),
      );

      expect(await quantityOf(alice.variantId)).toBe(25);

      const { rows } = await client.query(
        `select variant_id, product_id, workspace_id, seller_id, reason, quantity_delta,
                before_quantity_on_hand, after_quantity_on_hand, performed_by, note
         from public.stock_movements where id = $1`,
        [movementId],
      );

      expect(rows).toEqual([
        {
          variant_id: alice.variantId,
          product_id: alice.productId,
          workspace_id: alice.seller.workspaceId,
          seller_id: alice.seller.sellerId,
          reason: "purchase",
          quantity_delta: 15,
          before_quantity_on_hand: 10,
          after_quantity_on_hand: 25,
          performed_by: alice.seller.userId,
          note: "Eid restock",
        },
      ]);
    });
  });

  it("records a negative delta when stock goes down", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithVariant("alice", { quantity: 10 });

      const movementId = await asUser(client, alice.seller.userId, () =>
        adjustStock(alice.seller.workspaceId, alice.variantId, 4, "damage_loss"),
      );

      const { rows } = await client.query<{ quantity_delta: number }>(
        `select quantity_delta from public.stock_movements where id = $1`,
        [movementId],
      );

      expect(rows[0].quantity_delta).toBe(-6);
      expect(await quantityOf(alice.variantId)).toBe(4);
    });
  });

  it("allows stock to be set to exactly zero", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithVariant("alice", { quantity: 3 });

      await asUser(client, alice.seller.userId, () =>
        adjustStock(alice.seller.workspaceId, alice.variantId, 0, "sale"),
      );

      expect(await quantityOf(alice.variantId)).toBe(0);
    });
  });

  it("chains movements so each starts where the last one ended", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithVariant("alice", { quantity: 10 });

      await asUser(client, alice.seller.userId, async () => {
        await adjustStock(alice.seller.workspaceId, alice.variantId, 15, "purchase");
        await adjustStock(alice.seller.workspaceId, alice.variantId, 12, "sale");
      });

      const { rows } = await client.query(
        `select before_quantity_on_hand as before, after_quantity_on_hand as after
         from public.stock_movements where variant_id = $1 order by created_at`,
        [alice.variantId],
      );

      expect(rows).toEqual([
        { before: 10, after: 15 },
        { before: 15, after: 12 },
      ]);
    });
  });
});

describe("adjust_stock guards", () => {
  it("refuses a negative target", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithVariant("alice", { quantity: 10 });

      // The no-negative-stock guard. Refused, never clamped to zero: a silent
      // clamp would record a movement that is not what the caller asked for.
      await expect(
        asUser(client, alice.seller.userId, () =>
          adjustStock(alice.seller.workspaceId, alice.variantId, -1),
        ),
      ).rejects.toThrow(/stock_negative/);
    });
  });

  it("refuses a target below what is already reserved", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithVariant("alice", { quantity: 10 });
      await client.query(
        `update public.product_variants set reserved_quantity = 6 where id = $1`,
        [alice.variantId],
      );

      // Six units are promised to customers. Dropping on-hand to five would
      // promise stock that is not there.
      await expect(
        asUser(client, alice.seller.userId, () =>
          adjustStock(alice.seller.workspaceId, alice.variantId, 5),
        ),
      ).rejects.toThrow(/stock_below_reserved/);
    });
  });

  it("refuses an adjustment that changes nothing", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithVariant("alice", { quantity: 10 });

      // A movement must change the quantity; a zero-delta row is noise in the
      // history.
      await expect(
        asUser(client, alice.seller.userId, () =>
          adjustStock(alice.seller.workspaceId, alice.variantId, 10),
        ),
      ).rejects.toThrow(/stock_unchanged/);
    });
  });

  it("refuses a variant that does not track inventory", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithVariant("alice", { trackInventory: false });

      await expect(
        asUser(client, alice.seller.userId, () =>
          adjustStock(alice.seller.workspaceId, alice.variantId, 5),
        ),
      ).rejects.toThrow(/stock_not_tracked/);
    });
  });

  it("refuses a variant whose quantity was never set", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithVariant("alice", { quantity: null });

      // No starting quantity means there is no "before" to record honestly.
      await expect(
        asUser(client, alice.seller.userId, () =>
          adjustStock(alice.seller.workspaceId, alice.variantId, 5),
        ),
      ).rejects.toThrow(/stock_not_tracked/);
    });
  });
});

describe("adjust_stock isolation", () => {
  it("cannot adjust another seller's variant", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithVariant("alice", { quantity: 10 });
      const bob = await sellerWithVariant("bob", { quantity: 10 });

      // Reported as absent, not forbidden - the same reasoning as the product
      // API's 404. RLS hides Bob's variant, so the function cannot see it.
      await expect(
        asUser(client, alice.seller.userId, () =>
          adjustStock(bob.seller.workspaceId, bob.variantId, 99),
        ),
      ).rejects.toThrow(/variant_not_found/);
    });
  });

  it("leaves another seller's stock and history untouched", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithVariant("alice", { quantity: 10 });
      const bob = await sellerWithVariant("bob", { quantity: 10 });

      await client.query("savepoint attempt");
      await asUser(client, alice.seller.userId, () =>
        adjustStock(bob.seller.workspaceId, bob.variantId, 99),
      ).catch(() => undefined);
      await client.query("rollback to savepoint attempt");

      expect(await quantityOf(bob.variantId)).toBe(10);
      expect(await movementCount(bob.variantId)).toBe(0);
    });
  });

  it("refuses a variant named with the wrong workspace", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithVariant("alice", { quantity: 10 });
      const bob = await sellerWithVariant("bob", { quantity: 10 });

      await expect(
        asUser(client, alice.seller.userId, () =>
          adjustStock(bob.seller.workspaceId, alice.variantId, 5),
        ),
      ).rejects.toThrow(/variant_not_found/);
    });
  });

  it("anonymous role cannot call it", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithVariant("alice", { quantity: 10 });

      await expect(
        asAnon(client, () => adjustStock(alice.seller.workspaceId, alice.variantId, 5)),
      ).rejects.toThrow(/permission denied/i);
    });
  });
});

describe("history survives the right deletions only", () => {
  it("removing a seller's account removes their movements with it", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithVariant("alice", { quantity: 10 });
      await asUser(client, alice.seller.userId, () =>
        adjustStock(alice.seller.workspaceId, alice.variantId, 12, "purchase"),
      );

      // stock_movements refuses to lose a variant on its own, and points at
      // auth.users through performed_by. Neither may block closing an account.
      await client.query(`delete from auth.users where id = $1`, [alice.seller.userId]);
      // Both keys are checked at commit; this is that check, made now.
      await client.query(`set constraints all immediate`);

      expect(await movementCount(alice.variantId)).toBe(0);
    });
  });
});
