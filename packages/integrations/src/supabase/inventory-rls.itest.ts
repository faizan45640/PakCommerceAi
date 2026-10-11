/**
 * Tier 2 — tenant isolation for inventory and stock movements.
 *
 * Stock history says what a seller bought, sold and lost. It is as private as
 * the catalogue, and it is also evidence: a seller must not be able to read
 * another seller's movements, write one in someone else's name, or tidy up their
 * own afterwards.
 *
 * As in rls.itest.ts, every case checks the boundary from the outside - what a
 * seller can actually do - rather than inspecting policy definitions.
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
  insertStockMovement,
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

/** A seller with one product, one tracked variant and one recorded movement. */
async function sellerWithStock(label: string) {
  const seller: Seller = await createSeller(client, label);
  const productId = await insertProduct(client, seller, `${label}-kurta`);
  const variantId = await insertVariant(client, seller, productId, { sku: `${label}-1` });
  const movementId = await insertStockMovement(client, seller, productId, variantId);

  return { seller, productId, variantId, movementId };
}

describe("stock_movements isolation", () => {
  it("seller reads only their own movements", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithStock("alice");
      await sellerWithStock("bob");

      const rows = await asUser(client, alice.seller.userId, async () => {
        const result = await client.query<{ id: string }>(`select id from public.stock_movements`);
        return result.rows;
      });

      expect(rows.map((row) => row.id)).toEqual([alice.movementId]);
    });
  });

  it("seller can record a movement for their own variant", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithStock("alice");

      const movementId = await asUser(client, alice.seller.userId, () =>
        insertStockMovement(client, alice.seller, alice.productId, alice.variantId, {
          reason: "sale",
          delta: -1,
          before: 15,
          after: 14,
        }),
      );

      expect(movementId).toBeTruthy();
    });
  });

  it("seller cannot record a movement for another seller", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithStock("alice");
      const bob = await sellerWithStock("bob");

      await expect(
        asUser(client, alice.seller.userId, () =>
          insertStockMovement(client, bob.seller, bob.productId, bob.variantId, {
            performedBy: alice.seller.userId,
          }),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it("seller cannot record a movement against another seller's variant", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithStock("alice");
      const bob = await sellerWithStock("bob");

      // Alice claims the row as hers, so the policy passes - it is the composite
      // key that refuses, because Bob's variant is not in Alice's workspace.
      await expect(
        asUser(client, alice.seller.userId, () =>
          insertStockMovement(client, alice.seller, bob.productId, bob.variantId),
        ),
      ).rejects.toThrow(/stock_movements_variant_fkey/);
    });
  });

  it("seller cannot record a movement in someone else's name", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithStock("alice");
      const bob = await sellerWithStock("bob");

      // performed_by is the audit answer to "who did this". It is taken from the
      // session, not trusted from the row.
      await expect(
        asUser(client, alice.seller.userId, () =>
          insertStockMovement(client, alice.seller, alice.productId, alice.variantId, {
            performedBy: bob.seller.userId,
          }),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it("seller cannot edit their own movement", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithStock("alice");

      await expect(
        asUser(client, alice.seller.userId, () =>
          client.query(`update public.stock_movements set note = 'tidied' where id = $1`, [
            alice.movementId,
          ]),
        ),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it("seller cannot delete their own movement", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithStock("alice");

      await expect(
        asUser(client, alice.seller.userId, () =>
          client.query(`delete from public.stock_movements where id = $1`, [alice.movementId]),
        ),
      ).rejects.toThrow(/permission denied/i);
    });
  });
});

describe("inventory view isolation", () => {
  it("seller reads only their own inventory", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithStock("alice");
      await sellerWithStock("bob");

      const rows = await asUser(client, alice.seller.userId, async () => {
        const result = await client.query<{ variant_id: string }>(
          `select variant_id from public.inventory`,
        );
        return result.rows;
      });

      // A view runs as its owner unless told otherwise, which would return every
      // seller's stock. This passing is what proves security_invoker is on.
      expect(rows.map((row) => row.variant_id)).toEqual([alice.variantId]);
    });
  });
});

describe("anonymous access", () => {
  it("anonymous role cannot read movements", async () => {
    await withRollback(client, async () => {
      await sellerWithStock("alice");

      await expect(
        asAnon(client, () => client.query(`select id from public.stock_movements`)),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it("anonymous role cannot read inventory", async () => {
    await withRollback(client, async () => {
      await sellerWithStock("alice");

      await expect(
        asAnon(client, () => client.query(`select id from public.inventory`)),
      ).rejects.toThrow(/permission denied/i);
    });
  });
});
