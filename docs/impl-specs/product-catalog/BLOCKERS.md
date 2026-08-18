# Blocker Records — `product-catalog`

Per [`implementation-workflow.md`](../../../implementation-workflow.md) §4.1, any `OPEN`
blocker halts every phase of this module.

---

## BLK-1 — The baseline migration is reconstructed, not captured   [RESOLVED]

**Phase:** 1   **Raised:** 2026-08-18   **Resolved:** 2026-08-18   **Gate:** 2 (Reconcile)
**Where:** `supabase/migrations/20260818100001_baseline_identity_and_workspaces.sql`

**The question:** the baseline was reconstructed from `database.types.ts`, which records
columns, types, enums and foreign keys but nothing about defaults, indexes, triggers,
constraints or RLS. Did it match the live database?

**Resolution:** _(task owner obtained project access; `supabase db dump --linked --schema
public` run against the live project)_

**It did not match. The reconstruction was wrong in eleven ways:**

| Missing from the reconstruction | Consequence had it shipped |
|---|---|
| `handle_new_auth_user()` — creates a profile on signup, SECURITY DEFINER | Local signups would not create a profile |
| `create_default_workspace_for_seller()` + its trigger | Every seller would start with no workspace locally |
| 10 check constraints (name/phone/slug/description lengths, slug regex, `seller_verified_at_consistency`, `workspaces_archived_at_matches_status`) | Local accepts data production rejects |
| 4 `updated_at` triggers | `updated_at` frozen locally |
| `seller_profiles_slug_key`, `workspaces_seller_slug_unique` | Duplicate slugs locally; the default-workspace trigger's `ON CONFLICT` would error |
| `workspaces_one_default_per_seller_idx` | Multiple default workspaces locally |
| `seller_profiles_verification_status_idx` | — |
| **RLS already enabled with 8 policies** | Migration `0008` would have created a duplicate, parallel policy set |
| **Column-level grants** — sellers may update only display fields, never `verification_status` | Local grants table-wide UPDATE; the gap flagged in `0008` was already solved upstream |
| **`alter default privileges ... grant all on tables to anon`** | **Every new table is granted to `anon` automatically.** `products` would have been reachable by logged-out requests in production while the local test asserted it was denied |
| Table and column comments | Documentation lost |

**Actions taken:**

1. `0001` rewritten as a faithful capture of the live schema, verified by dumping both
   databases and diffing: **zero differences** outside the new catalogue objects.
2. `0002` (`set_updated_at`) **deleted** — the function already existed upstream and is now
   part of the baseline.
3. `0008` (identity RLS) **deleted** — production already had equivalent policies, with
   better column-grant hygiene than the version written blind.
4. `0007` gained explicit `revoke all ... from anon` on both catalogue tables, because the
   inherited default privileges would otherwise grant `anon` access to every new table.
5. The test fixture now uses the trigger-created default workspace instead of making its
   own, matching production behaviour.

**The lesson, recorded because it will recur:** generated types are not a schema. They
describe shape, not behaviour or permissions. Any future baseline of an existing database
must come from `db dump`, never from types.

---

## BLK-2 — No credentials to apply migrations to the hosted project   [OPEN]

**Phase:** 1   **Raised:** 2026-08-18   **Gate:** 6 (Run)
**Where:** the Supabase project `lnznyolcbmqxnweuvawf`

**The question:** Everything in this module was developed and verified against the **local**
Supabase stack. Nothing has been applied to the hosted database. Doing so needs credentials
this working tree does not have:

| Credential | State | Needed for |
|---|---|---|
| `SUPABASE_URL`, publishable/anon key | present in `.env` | client reads — already working |
| `SUPABASE_SERVICE_ROLE_KEY` | **empty** | admin operations that bypass RLS |
| `DATABASE_URL` | **empty** | a direct psql connection |
| Supabase CLI access token | **absent** | `supabase link` and `supabase db push` |

**What the documents say nearest to it:** `docs/RUNBOOK.md` §4 lists these variables and
marks `DATABASE_URL` as "Present in `.env.example` but unused by any code today". That is
still true of application code, but it is now needed by tooling.

**Options:**
- A — The project owner runs `supabase login` and `supabase db push` from their own machine.
  Migrations stay reviewable in the repository; the push is a deliberate human act.
- B — Store a service-role key and database URL in the repo's environment. Rejected — it
  puts a credential that bypasses RLS onto four machines.

**Recommendation:** A. The commands are in `docs/supabase-setup.md`. Deployment is a human
decision, the same way pushing to GitHub is.

**Resolution:** _(written by a human)_


---

## BLK-3 — `workspaces` is granted to `anon`, unlike the other identity tables   [OPEN]

**Phase:** 6   **Raised:** 2026-08-18   **Gate:** 7 (Scan)
**Where:** `supabase/migrations/20260818100001_baseline_identity_and_workspaces.sql`, the
privileges section — inherited from the live schema, not introduced here.

**The question:** production grants `ALL ON TABLE workspaces TO anon`, while `profiles` and
`seller_profiles` grant `anon` nothing. Is that deliberate?

**Why it matters:** it is not currently a leak — RLS is enabled on `workspaces` and no policy
grants `anon` anything, so a logged-out request returns zero rows. But it removes one of the
two independent barriers the other tables have. `profiles` stops `anon` at the privilege
layer *and* at RLS; `workspaces` stops it only at RLS. A future permissive policy, or RLS
being disabled during debugging, would expose every seller's workspace list.

`ALL` also includes `TRUNCATE`, which **RLS does not filter**. Today `anon` cannot reach the
database without a valid token, so this is not exploitable — but it is more privilege than
the table needs.

**Options:**
- A — `revoke all on public.workspaces from anon` in a new migration, matching the other two
  tables. Cost: a migration and a test update. Risk: near zero, since nothing anonymous reads
  workspaces today.
- B — Leave it. Cost: an inconsistency nobody can explain later, and one barrier instead of
  two.

**Recommendation:** A, as a small follow-up task rather than inside T-020 — it changes a
pre-existing production grant, which deserves its own reviewable change.

**Resolution:** _(written by a human)_
