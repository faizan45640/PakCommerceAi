# Blocker Records — `product-catalog`

Per [`implementation-workflow.md`](../../../implementation-workflow.md) §4.1, any `OPEN`
blocker halts every phase of this module.

---

## BLK-1 — The baseline migration is reconstructed, not captured   [OPEN]

**Phase:** 1   **Raised:** 2026-08-18   **Gate:** 2 (Reconcile)
**Where:** `supabase/migrations/20260818100001_baseline_identity_and_workspaces.sql`

**The question:** `profiles`, `seller_profiles` and `workspaces` were created by hand in the
Supabase dashboard before migrations existed. The baseline migration has to reproduce them,
but the only machine-readable record of that schema in this repository is
`packages/integrations/src/supabase/database.types.ts`.

Generated types are authoritative for **columns, types, enums and foreign keys**. They say
nothing about **defaults, indexes, triggers, check constraints, or existing RLS policies**.
Everything in the baseline beyond columns and keys is therefore an informed reconstruction:

- `profiles.id references auth.users (id) on delete cascade` — the standard Supabase
  pattern, and `profiles.id` has no default so it must come from somewhere. Foreign keys
  into the `auth` schema do not appear in generated public-schema relationships, so this
  cannot be confirmed from the types.
- `seller_profiles.slug unique` — inferred from it being a slug.
- Defaults (`now()`, `gen_random_uuid()`, `'pending'`, `'active'`, `false`) — inferred from
  which fields are optional in the generated `Insert` types.
- `workspaces_seller_id_idx` — added because every tenant query needs it. May not exist
  upstream.

If the live project differs, a fresh clone and the deployed database diverge silently, and
the next person to run `supabase db reset` gets a schema that never existed.

**What the documents say nearest to it:** `docs/PROJECT_CONTEXT.md` records "There is no
`supabase/migrations/` directory. The schema is not reproducible from source control" and
raises Open Decision #5, "Who owns migrations, and where do they live?" — which this module
answers, but only for schema written from here on.

**Options:**
- A — Someone with dashboard access runs `supabase link --project-ref lnznyolcbmqxnweuvawf`
  then `supabase db diff --linked --schema public`, and the output is folded into the
  baseline as a correction migration. Cost: ~15 minutes and a Supabase access token.
- B — Accept the reconstruction. Cost: local and deployed schemas may differ in ways nobody
  discovers until a query behaves differently in production.

**Recommendation:** A, before this branch is merged. It is the only step that turns the
baseline from a good guess into a fact, and it gets cheaper the sooner it happens — every
migration written on top of an unverified baseline inherits the doubt.

**If unanswered I will:** stop. The tables and tests in this module are unaffected by the
answer — they are additive and were verified against a database built from these
migrations — but the baseline itself stays provisional until someone diffs it.

**Resolution:** _(written by a human)_

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
