/**
 * Tier 2 — schema conformance for the product catalogue.
 *
 * The point of a shared contract is that code and database agree. These tests
 * fail the moment they drift: a Zod enum value added without a matching
 * migration, a constraint quietly dropped, a column renamed on one side only.
 *
 * Requires the local Supabase stack: `npx supabase start`.
 */

import {
  inventoryStateValues,
  productStatusValues,
  productVariantStatusValues,
} from "@pakcommerce/shared";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connect, createSeller, insertProduct, withRollback } from "./testing/database.js";

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

async function insertVariant(
  client_: Client,
  seller: { workspaceId: string },
  productId: string,
  overrides: Record<string, unknown> = {},
) {
  const { rows } = await client_.query(
    `insert into public.product_variants
       (product_id, workspace_id, title, sku, price_amount_minor,
        track_inventory, quantity_on_hand, low_stock_threshold)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id, inventory_state`,
    [
      productId,
      overrides.workspaceId ?? seller.workspaceId,
      overrides.title ?? "Default",
      overrides.sku ?? null,
      overrides.price ?? 250000,
      overrides.trackInventory ?? true,
      overrides.quantity ?? 10,
      overrides.threshold ?? null,
    ],
  );

  return rows[0] as { id: string; inventory_state: string };
}

describe("table shape", () => {
  it("products table exists with contract columns", async () => {
    expect(await columnsOf("products")).toEqual(
      [
        "archived_at",
        "category_ids",
        "created_at",
        "description",
        "id",
        "options",
        "search_text",
        "seller_id",
        "slug",
        "status",
        "tags",
        "title",
        "updated_at",
        "workspace_id",
      ].sort(),
    );
  });

  it("product_variants table exists with contract columns", async () => {
    expect(await columnsOf("product_variants")).toEqual(
      [
        "barcode",
        "compare_at_price_amount_minor",
        "compare_at_price_currency",
        "created_at",
        "id",
        "inventory_state",
        "low_stock_threshold",
        "option_values",
        "position",
        "price_amount_minor",
        "price_currency",
        "product_id",
        "quantity_on_hand",
        "sku",
        "status",
        "title",
        "track_inventory",
        "updated_at",
        "workspace_id",
      ].sort(),
    );
  });
});

describe("enums match the shared contract", () => {
  it("product status enum matches the contract", async () => {
    expect(await enumValues("product_status")).toEqual([...productStatusValues]);
  });

  it("variant status enum matches the contract", async () => {
    expect(await enumValues("product_variant_status")).toEqual([...productVariantStatusValues]);
  });

  it("inventory state enum matches the contract", async () => {
    expect(await enumValues("inventory_state")).toEqual([...inventoryStateValues]);
  });
});

describe("products constraints", () => {
  it("product rejects a blank title", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "blank-title");

      await expect(insertProduct(client, seller, "blank", { title: "   " })).rejects.toThrow(
        /products_title_not_blank/,
      );
    });
  });

  it("product rejects more than three options", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "too-many-options");
      const options = JSON.stringify(
        [0, 1, 2, 3].map((position) => ({ name: `o${position}`, values: ["a"], position })),
      );

      await expect(
        client.query(
          `insert into public.products (workspace_id, seller_id, title, slug, options)
           values ($1, $2, 'Kurta', 'kurta', $3::jsonb)`,
          [seller.workspaceId, seller.sellerId, options],
        ),
      ).rejects.toThrow(/products_options_max/);
    });
  });

  it("product rejects a workspace and seller that do not match", async () => {
    await withRollback(client, async () => {
      const owner = await createSeller(client, "owner");
      const other = await createSeller(client, "other");

      // The tenant invariant: this pair does not describe a real workspace.
      await expect(
        insertProduct(client, owner, "mismatch", { sellerId: other.sellerId }),
      ).rejects.toThrow(/products_workspace_seller_fkey/);
    });
  });

  it("product slug is unique per workspace", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "dup-slug");
      await insertProduct(client, seller, "lawn-kurta", { status: "active" });

      await expect(
        insertProduct(client, seller, "lawn-kurta", { status: "active" }),
      ).rejects.toThrow(/products_workspace_slug_key/);
    });
  });

  it("archived product releases its slug", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "archived-slug");
      await insertProduct(client, seller, "lawn-kurta", { status: "archived" });

      // The unique index excludes archived rows, so the slug is reusable.
      await expect(
        insertProduct(client, seller, "lawn-kurta", { status: "active" }),
      ).resolves.toBeTruthy();
    });
  });
});

describe("product_variants constraints", () => {
  it("variant rejects a negative price", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "neg-price");
      const productId = await insertProduct(client, seller, "kurta");

      await expect(insertVariant(client, seller, productId, { price: -1 })).rejects.toThrow(
        /product_variants_price_non_negative/,
      );
    });
  });

  it("variant sku is unique per workspace", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "dup-sku");
      const productId = await insertProduct(client, seller, "kurta");
      await insertVariant(client, seller, productId, { sku: "SKU-1" });

      await expect(
        insertVariant(client, seller, productId, { sku: "SKU-1" }),
      ).rejects.toThrow(/product_variants_workspace_sku_key/);
    });
  });

  it("variant inherits its product workspace", async () => {
    await withRollback(client, async () => {
      const owner = await createSeller(client, "variant-owner");
      const other = await createSeller(client, "variant-other");
      const productId = await insertProduct(client, owner, "kurta");

      await expect(
        insertVariant(client, owner, productId, { workspaceId: other.workspaceId }),
      ).rejects.toThrow(/product_variants_product_workspace_fkey/);
    });
  });
});

describe("inventory_state is derived", () => {
  it("inventory state is untracked when tracking is off", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "untracked");
      const productId = await insertProduct(client, seller, "kurta");
      const variant = await insertVariant(client, seller, productId, { trackInventory: false });

      expect(variant.inventory_state).toBe("untracked");
    });
  });

  it("inventory state is out_of_stock at zero", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "oos");
      const productId = await insertProduct(client, seller, "kurta");
      const variant = await insertVariant(client, seller, productId, { quantity: 0 });

      expect(variant.inventory_state).toBe("out_of_stock");
    });
  });

  it("inventory state is low_stock at or below threshold", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "low");
      const productId = await insertProduct(client, seller, "kurta");
      const variant = await insertVariant(client, seller, productId, {
        quantity: 2,
        threshold: 2,
      });

      expect(variant.inventory_state).toBe("low_stock");
    });
  });

  it("inventory state is in_stock above threshold", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "in-stock");
      const productId = await insertProduct(client, seller, "kurta");
      const variant = await insertVariant(client, seller, productId, {
        quantity: 9,
        threshold: 2,
      });

      expect(variant.inventory_state).toBe("in_stock");
    });
  });

  it("inventory state cannot be written directly", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "no-write");
      const productId = await insertProduct(client, seller, "kurta");

      // A writable state column would be a second source of truth for stock.
      await expect(
        client.query(
          `insert into public.product_variants
             (product_id, workspace_id, title, price_amount_minor, inventory_state)
           values ($1, $2, 'Default', 1000, 'in_stock')`,
          [productId, seller.workspaceId],
        ),
      ).rejects.toThrow(/non-DEFAULT value|generated/i);
    });
  });
});

describe("updated_at trigger", () => {
  it("updated_at changes on update", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "touch");
      const productId = await insertProduct(client, seller, "kurta");

      // now() is the transaction clock, so backdate first — otherwise insert and
      // update would share a timestamp inside one transaction and prove nothing.
      await client.query(
        `update public.products set updated_at = now() - interval '1 day' where id = $1`,
        [productId],
      );

      await client.query(`update public.products set title = 'Renamed' where id = $1`, [
        productId,
      ]);

      const { rows } = await client.query<{ is_fresh: boolean }>(
        `select updated_at > now() - interval '1 minute' as is_fresh
         from public.products where id = $1`,
        [productId],
      );

      expect(rows[0].is_fresh).toBe(true);
    });
  });
});
