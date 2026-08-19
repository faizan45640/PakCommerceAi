/**
 * Tier 2 — tenant isolation for the product catalogue.
 *
 * "Every resource belongs to exactly one seller" is a project invariant
 * (docs/PROJECT_CONTEXT.md). These are the tests that prove it, and they are the
 * most valuable tests in this task: a failure here is one seller reading another
 * seller's catalogue.
 *
 * Every case sets up two sellers and checks the boundary from the outside — what
 * seller A can actually do to seller B's rows — rather than inspecting policy
 * definitions. A policy that exists but does not work would pass the latter.
 *
 * Requires the local Supabase stack: `npx supabase start`.
 */

import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asAnon, asUser, connect, createSeller, insertProduct, withRollback } from "./testing/database.js";

let client: Client;

beforeAll(async () => {
  client = await connect();
});

afterAll(async () => {
  await client?.end();
});

describe("products isolation", () => {
  it("seller reads only their own products", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice");
      const bob = await createSeller(client, "bob");
      await insertProduct(client, alice, "alice-kurta");
      await insertProduct(client, bob, "bob-kurta");

      const rows = await asUser(client, alice.userId, async () => {
        const result = await client.query<{ slug: string }>(
          `select slug from public.products`,
        );
        return result.rows;
      });

      expect(rows.map((row) => row.slug)).toEqual(["alice-kurta"]);
    });
  });

  it("seller cannot read another seller's products", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice");
      const bob = await createSeller(client, "bob");
      const bobProduct = await insertProduct(client, bob, "bob-kurta");

      const rows = await asUser(client, alice.userId, async () => {
        const result = await client.query(`select id from public.products where id = $1`, [
          bobProduct,
        ]);
        return result.rows;
      });

      // Not an error — RLS makes the row simply not exist for Alice.
      expect(rows).toHaveLength(0);
    });
  });

  it("seller cannot insert a product for another seller", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice");
      const bob = await createSeller(client, "bob");

      await expect(
        asUser(client, alice.userId, () =>
          client.query(
            `insert into public.products (workspace_id, seller_id, title, slug)
             values ($1, $2, 'Stolen', 'stolen')`,
            [bob.workspaceId, bob.sellerId],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it("seller cannot reassign a product to another seller", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice");
      const bob = await createSeller(client, "bob");
      const aliceProduct = await insertProduct(client, alice, "alice-kurta");

      // WITH CHECK on update is what stops this. USING alone would allow it.
      await expect(
        asUser(client, alice.userId, () =>
          client.query(
            `update public.products set workspace_id = $1, seller_id = $2 where id = $3`,
            [bob.workspaceId, bob.sellerId, aliceProduct],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it("seller cannot delete another seller's product", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice");
      const bob = await createSeller(client, "bob");
      const bobProduct = await insertProduct(client, bob, "bob-kurta");

      const deleted = await asUser(client, alice.userId, async () => {
        const result = await client.query(`delete from public.products where id = $1`, [
          bobProduct,
        ]);
        return result.rowCount;
      });

      expect(deleted).toBe(0);

      const { rows } = await client.query(`select id from public.products where id = $1`, [
        bobProduct,
      ]);
      expect(rows).toHaveLength(1);
    });
  });
});

describe("product_variants isolation", () => {
  async function insertVariant(seller: { workspaceId: string }, productId: string, sku: string) {
    await client.query(
      `insert into public.product_variants
         (product_id, workspace_id, title, sku, price_amount_minor)
       values ($1, $2, 'Default', $3, 250000)`,
      [productId, seller.workspaceId, sku],
    );
  }

  it("seller reads only their own variants", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice");
      const bob = await createSeller(client, "bob");
      const aliceProduct = await insertProduct(client, alice, "alice-kurta");
      const bobProduct = await insertProduct(client, bob, "bob-kurta");
      await insertVariant(alice, aliceProduct, "ALICE-1");
      await insertVariant(bob, bobProduct, "BOB-1");

      const rows = await asUser(client, alice.userId, async () => {
        const result = await client.query<{ sku: string }>(
          `select sku from public.product_variants`,
        );
        return result.rows;
      });

      // Variants carry no seller_id; ownership is inherited through products.
      expect(rows.map((row) => row.sku)).toEqual(["ALICE-1"]);
    });
  });

  it("seller cannot insert a variant under another seller's product", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice");
      const bob = await createSeller(client, "bob");
      const bobProduct = await insertProduct(client, bob, "bob-kurta");

      await expect(
        asUser(client, alice.userId, () =>
          client.query(
            `insert into public.product_variants
               (product_id, workspace_id, title, price_amount_minor)
             values ($1, $2, 'Stolen', 1000)`,
            [bobProduct, bob.workspaceId],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });
});

describe("anonymous access", () => {
  it("anonymous role reads nothing", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice");
      await insertProduct(client, alice, "alice-kurta");

      // Denied at the privilege layer, before RLS is even consulted. Stronger
      // than returning an empty set: anon cannot address the table at all.
      await expect(
        asAnon(client, () => client.query(`select id from public.products`)),
      ).rejects.toThrow(/permission denied/i);
    });
  });
});
