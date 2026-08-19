/**
 * Tier 2 — tenant isolation for the identity tables.
 *
 * profiles, seller_profiles and workspaces hold who a seller is: their name,
 * phone number, business details and the workspaces their whole catalogue hangs
 * off. These policies came from the hosted project and are captured in the
 * baseline migration.
 *
 * As with the catalogue tests, these check the boundary from the outside — what
 * seller A can actually do to seller B's rows — rather than reading policy
 * definitions back.
 *
 * Requires the local Supabase stack: `npx supabase start`.
 */

import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asAnon, asUser, connect, createSeller, withRollback } from "./testing/database.js";

let client: Client;

beforeAll(async () => {
  client = await connect();
});

afterAll(async () => {
  await client?.end();
});

describe("profiles isolation", () => {
  it("user reads only their own profile", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice");
      await createSeller(client, "bob");

      const rows = await asUser(client, alice.userId, async () => {
        const result = await client.query<{ id: string }>(`select id from public.profiles`);
        return result.rows;
      });

      expect(rows.map((row) => row.id)).toEqual([alice.userId]);
    });
  });

  it("user cannot read another user's profile", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice");
      const bob = await createSeller(client, "bob");

      const rows = await asUser(client, alice.userId, async () => {
        const result = await client.query(`select id from public.profiles where id = $1`, [
          bob.userId,
        ]);
        return result.rows;
      });

      expect(rows).toHaveLength(0);
    });
  });

  it("user cannot update another user's profile", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice");
      const bob = await createSeller(client, "bob");

      const updated = await asUser(client, alice.userId, async () => {
        const result = await client.query(
          `update public.profiles set full_name = 'Hacked' where id = $1`,
          [bob.userId],
        );
        return result.rowCount;
      });

      // RLS filters the row out of the update rather than raising.
      expect(updated).toBe(0);
    });
  });

  it("user cannot insert a profile for someone else", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice");

      // Denied at the privilege layer: authenticated has SELECT and a column-
      // scoped UPDATE on profiles, but no INSERT grant at all. Rows are created
      // only by handle_new_auth_user(), which runs SECURITY DEFINER at signup.
      await expect(
        asUser(client, alice.userId, () =>
          client.query(`insert into public.profiles (id, full_name) values ($1, 'Impostor')`, [
            "99999999-9999-4999-8999-999999999999",
          ]),
        ),
      ).rejects.toThrow(/permission denied/i);
    });
  });
});

describe("seller_profiles isolation", () => {
  it("seller reads only their own business profile", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice");
      await createSeller(client, "bob");

      const rows = await asUser(client, alice.userId, async () => {
        const result = await client.query<{ business_name: string }>(
          `select business_name from public.seller_profiles`,
        );
        return result.rows;
      });

      // Business name, phone and email are private. This is an operations
      // platform, not a marketplace with public seller pages.
      expect(rows.map((row) => row.business_name)).toEqual(["alice Traders"]);
    });
  });

  it("seller cannot read another seller's business profile", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice");
      const bob = await createSeller(client, "bob");

      const rows = await asUser(client, alice.userId, async () => {
        const result = await client.query(
          `select id from public.seller_profiles where id = $1`,
          [bob.sellerId],
        );
        return result.rows;
      });

      expect(rows).toHaveLength(0);
    });
  });
});

describe("workspaces isolation", () => {
  it("seller reads only their own workspaces", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice");
      await createSeller(client, "bob");

      const rows = await asUser(client, alice.userId, async () => {
        const result = await client.query<{ id: string }>(`select id from public.workspaces`);
        return result.rows;
      });

      expect(rows.map((row) => row.id)).toEqual([alice.workspaceId]);
    });
  });

  it("seller cannot insert a workspace for another seller", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice");
      const bob = await createSeller(client, "bob");

      await expect(
        asUser(client, alice.userId, () =>
          client.query(
            `insert into public.workspaces (seller_id, name, slug) values ($1, 'Stolen', 'stolen')`,
            [bob.sellerId],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it("seller cannot reassign a workspace to another seller", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice");
      const bob = await createSeller(client, "bob");

      // Handing over a workspace would hand over its entire catalogue with it.
      await expect(
        asUser(client, alice.userId, () =>
          client.query(`update public.workspaces set seller_id = $1 where id = $2`, [
            bob.sellerId,
            alice.workspaceId,
          ]),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it("seller cannot hard delete a workspace", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice");

      const deleted = await asUser(client, alice.userId, async () => {
        const result = await client.query(`delete from public.workspaces where id = $1`, [
          alice.workspaceId,
        ]);
        return result.rowCount;
      });

      // There is no delete policy on purpose: deleting a workspace cascades to
      // every product in it. The contract models retirement as status='archived',
      // which is reversible and auditable.
      expect(deleted).toBe(0);

      const { rows } = await client.query(`select id from public.workspaces where id = $1`, [
        alice.workspaceId,
      ]);
      expect(rows).toHaveLength(1);
    });
  });

  it("seller can archive their own workspace", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice");

      const updated = await asUser(client, alice.userId, async () => {
        const result = await client.query(
          `update public.workspaces set status = 'archived', archived_at = now() where id = $1`,
          [alice.workspaceId],
        );
        return result.rowCount;
      });

      // The supported way to retire a workspace must actually work.
      expect(updated).toBe(1);
    });
  });
});

describe("anonymous access to identity tables", () => {
  it("anonymous role cannot read profiles", async () => {
    await withRollback(client, async () => {
      await createSeller(client, "alice");

      await expect(
        asAnon(client, () => client.query(`select id from public.profiles`)),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it("anonymous role cannot read seller profiles", async () => {
    await withRollback(client, async () => {
      await createSeller(client, "alice");

      await expect(
        asAnon(client, () => client.query(`select id from public.seller_profiles`)),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it("anonymous role cannot read workspaces", async () => {
    await withRollback(client, async () => {
      await createSeller(client, "alice");

      // workspaces is granted to anon (unlike profiles and seller_profiles), so
      // anon clears the privilege layer and is stopped by RLS instead: no policy
      // grants anon anything, and RLS denies by default. One barrier here rather
      // than two - an inconsistency in the pre-existing grants, recorded under
      // "Known defects" in docs/PROJECT_CONTEXT.md.
      const rows = await asAnon(client, async () => {
        const result = await client.query(`select id from public.workspaces`);
        return result.rows;
      });

      expect(rows).toHaveLength(0);
    });
  });
});
