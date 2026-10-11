/**
 * Tier 2 — schema conformance for inventory and stock movements.
 *
 * The inventory contract (packages/shared/src/inventory) says what a stock
 * record and a movement look like. These tests fail the moment storage stops
 * agreeing with it: a reason added on one side only, a constraint dropped, a
 * movement that can be rewritten after the fact.
 *
 * Requires the local Supabase stack: `npx supabase start`.
 */

import { stockMovementReasonValues } from "@pakcommerce/shared";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  connect,
  createSeller,
  insertProduct,
  insertStockMovement,
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

async function inventoryStateOf(variantId: string): Promise<string> {
  const { rows } = await client.query<{ inventory_state: string }>(
    `select inventory_state from public.product_variants where id = $1`,
    [variantId],
  );

  return rows[0].inventory_state;
}

describe("table shape", () => {
  it("stock_movements table exists with contract columns", async () => {
    expect(await columnsOf("stock_movements")).toEqual(
      [
        "after_quantity_on_hand",
        "before_quantity_on_hand",
        "created_at",
        "id",
        "note",
        "performed_by",
        "product_id",
        "quantity_delta",
        "reason",
        "seller_id",
        "variant_id",
        "workspace_id",
      ].sort(),
    );
  });

  it("inventory view exists with contract columns", async () => {
    expect(await columnsOf("inventory")).toEqual(
      [
        "available_quantity",
        "created_at",
        "id",
        "low_stock_threshold",
        "product_id",
        "quantity_on_hand",
        "reserved_quantity",
        "seller_id",
        "state",
        "track_inventory",
        "updated_at",
        "variant_id",
        "workspace_id",
      ].sort(),
    );
  });

  it("stock movement reason enum matches the contract", async () => {
    const { rows } = await client.query<{ value: string }>(
      `select e.enumlabel as value
       from pg_type t
       join pg_enum e on e.enumtypid = t.oid
       where t.typname = 'stock_movement_reason'
       order by e.enumsortorder`,
    );

    expect(rows.map((row) => row.value)).toEqual([...stockMovementReasonValues]);
  });
});

describe("reserved quantity", () => {
  it("reserved quantity defaults to zero", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "reserved-default");
      const productId = await insertProduct(client, seller, "kurta");
      const variantId = await insertVariant(client, seller, productId);

      const { rows } = await client.query<{ reserved_quantity: number }>(
        `select reserved_quantity from public.product_variants where id = $1`,
        [variantId],
      );

      expect(rows[0].reserved_quantity).toBe(0);
    });
  });

  it("variant rejects a negative reserved quantity", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "reserved-negative");
      const productId = await insertProduct(client, seller, "kurta");
      const variantId = await insertVariant(client, seller, productId);

      await expect(
        client.query(`update public.product_variants set reserved_quantity = -1 where id = $1`, [
          variantId,
        ]),
      ).rejects.toThrow(/product_variants_reserved_quantity_non_negative/);
    });
  });

  it("variant rejects reserving more than is on hand", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "reserved-over");
      const productId = await insertProduct(client, seller, "kurta");
      const variantId = await insertVariant(client, seller, productId, { quantity: 4 });

      await expect(
        client.query(`update public.product_variants set reserved_quantity = 5 where id = $1`, [
          variantId,
        ]),
      ).rejects.toThrow(/product_variants_reserved_within_on_hand/);
    });
  });

  it("inventory state is out_of_stock when everything on hand is reserved", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "reserved-all");
      const productId = await insertProduct(client, seller, "kurta");
      const variantId = await insertVariant(client, seller, productId, { quantity: 5 });

      await client.query(
        `update public.product_variants set reserved_quantity = 5 where id = $1`,
        [variantId],
      );

      // Five on the shelf, five already promised: nothing left to sell.
      expect(await inventoryStateOf(variantId)).toBe("out_of_stock");
    });
  });

  it("inventory state is low_stock when available falls to the threshold", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "reserved-low");
      const productId = await insertProduct(client, seller, "kurta");
      const variantId = await insertVariant(client, seller, productId, {
        quantity: 5,
        threshold: 2,
      });

      await client.query(
        `update public.product_variants set reserved_quantity = 3 where id = $1`,
        [variantId],
      );

      expect(await inventoryStateOf(variantId)).toBe("low_stock");
    });
  });
});

describe("inventory view", () => {
  it("inventory lists a tracked variant with its available quantity", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "inventory-row");
      const productId = await insertProduct(client, seller, "kurta");
      const variantId = await insertVariant(client, seller, productId, {
        quantity: 9,
        threshold: 2,
      });
      await client.query(
        `update public.product_variants set reserved_quantity = 4 where id = $1`,
        [variantId],
      );

      const { rows } = await client.query(
        `select variant_id, product_id, seller_id, workspace_id, track_inventory,
                quantity_on_hand, reserved_quantity, available_quantity,
                low_stock_threshold, state
         from public.inventory where variant_id = $1`,
        [variantId],
      );

      expect(rows).toEqual([
        {
          variant_id: variantId,
          product_id: productId,
          seller_id: seller.sellerId,
          workspace_id: seller.workspaceId,
          track_inventory: true,
          quantity_on_hand: 9,
          reserved_quantity: 4,
          available_quantity: 5,
          low_stock_threshold: 2,
          state: "in_stock",
        },
      ]);
    });
  });

  it("inventory has no row for an untracked variant", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "inventory-untracked");
      const productId = await insertProduct(client, seller, "kurta");
      const variantId = await insertVariant(client, seller, productId, {
        trackInventory: false,
      });

      const { rows } = await client.query(
        `select id from public.inventory where variant_id = $1`,
        [variantId],
      );

      expect(rows).toHaveLength(0);
    });
  });

  it("inventory cannot be written directly", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "inventory-readonly");
      const productId = await insertProduct(client, seller, "kurta");
      const variantId = await insertVariant(client, seller, productId);

      // The view is a read shape. Stock is written on product_variants only, or
      // there would be two places to change the same number.
      await expect(
        client.query(`update public.inventory set quantity_on_hand = 99 where variant_id = $1`, [
          variantId,
        ]),
      ).rejects.toThrow(/cannot update view/i);
    });
  });
});

describe("stock_movements constraints", () => {
  it("movement rejects a zero delta", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "zero-delta");
      const productId = await insertProduct(client, seller, "kurta");
      const variantId = await insertVariant(client, seller, productId);

      await expect(
        insertStockMovement(client, seller, productId, variantId, {
          delta: 0,
          before: 10,
          after: 10,
        }),
      ).rejects.toThrow(/stock_movements_delta_not_zero/);
    });
  });

  it("movement rejects quantities that do not add up", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "bad-sum");
      const productId = await insertProduct(client, seller, "kurta");
      const variantId = await insertVariant(client, seller, productId);

      await expect(
        insertStockMovement(client, seller, productId, variantId, {
          delta: 5,
          before: 10,
          after: 99,
        }),
      ).rejects.toThrow(/stock_movements_quantities_consistent/);
    });
  });

  it("movement rejects a negative resulting quantity", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "negative-after");
      const productId = await insertProduct(client, seller, "kurta");
      const variantId = await insertVariant(client, seller, productId);

      await expect(
        insertStockMovement(client, seller, productId, variantId, {
          reason: "sale",
          delta: -3,
          before: 2,
          after: -1,
        }),
      ).rejects.toThrow(/stock_movements_after_non_negative/);
    });
  });

  it("movement rejects a note over 500 characters", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "long-note");
      const productId = await insertProduct(client, seller, "kurta");
      const variantId = await insertVariant(client, seller, productId);

      await expect(
        insertStockMovement(client, seller, productId, variantId, { note: "x".repeat(501) }),
      ).rejects.toThrow(/stock_movements_note_max_length/);
    });
  });

  it("movement rejects an unknown reason", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "bad-reason");
      const productId = await insertProduct(client, seller, "kurta");
      const variantId = await insertVariant(client, seller, productId);

      await expect(
        insertStockMovement(client, seller, productId, variantId, { reason: "stolen" }),
      ).rejects.toThrow(/invalid input value for enum/i);
    });
  });

  it("movement rejects a variant that belongs to a different product", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "wrong-product");
      const kurta = await insertProduct(client, seller, "kurta");
      const shalwar = await insertProduct(client, seller, "shalwar");
      const kurtaVariant = await insertVariant(client, seller, kurta);

      await expect(
        insertStockMovement(client, seller, kurta, kurtaVariant, { productId: shalwar }),
      ).rejects.toThrow(/stock_movements_variant_fkey/);
    });
  });

  it("movement rejects a workspace and seller that do not match", async () => {
    await withRollback(client, async () => {
      const owner = await createSeller(client, "movement-owner");
      const other = await createSeller(client, "movement-other");
      const productId = await insertProduct(client, owner, "kurta");
      const variantId = await insertVariant(client, owner, productId);

      await expect(
        insertStockMovement(client, owner, productId, variantId, { sellerId: other.sellerId }),
      ).rejects.toThrow(/stock_movements_workspace_seller_fkey/);
    });
  });
});

describe("stock_movements are append-only", () => {
  it("movement cannot be edited, even by the table owner", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "no-edit");
      const productId = await insertProduct(client, seller, "kurta");
      const variantId = await insertVariant(client, seller, productId);
      const movementId = await insertStockMovement(client, seller, productId, variantId);

      // Not a privilege: the owner bypasses those. History that an admin client
      // or a sync job could quietly rewrite is not an audit trail.
      await expect(
        client.query(`update public.stock_movements set note = 'rewritten' where id = $1`, [
          movementId,
        ]),
      ).rejects.toThrow(/append-only/i);
    });
  });

  it("variant with movement history cannot be deleted on its own", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "no-orphan");
      const productId = await insertProduct(client, seller, "kurta");
      const variantId = await insertVariant(client, seller, productId);
      await insertStockMovement(client, seller, productId, variantId);

      await expect(
        client.query(`delete from public.product_variants where id = $1`, [variantId]),
      ).rejects.toThrow(/stock_movements_variant_fkey/);
    });
  });

  it("movements in one transaction keep their order", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "ordered");
      const productId = await insertProduct(client, seller, "kurta");
      const variantId = await insertVariant(client, seller, productId);

      // now() is frozen for the whole transaction, so three movements written
      // together would share one timestamp and their order would be lost.
      await insertStockMovement(client, seller, productId, variantId, {
        delta: 5,
        before: 10,
        after: 15,
      });
      await insertStockMovement(client, seller, productId, variantId, {
        reason: "sale",
        delta: -2,
        before: 15,
        after: 13,
      });
      await insertStockMovement(client, seller, productId, variantId, {
        reason: "damage_loss",
        delta: -1,
        before: 13,
        after: 12,
      });

      const { rows } = await client.query<{ after_quantity_on_hand: number }>(
        `select after_quantity_on_hand from public.stock_movements
         where variant_id = $1 order by created_at`,
        [variantId],
      );

      expect(rows.map((row) => row.after_quantity_on_hand)).toEqual([15, 13, 12]);
    });
  });
});
