# Phase 1 — Migration infrastructure and baseline

## Gate 2 — Reconcile

The spec assumed migrations existed. They did not: no `supabase/` directory, no migration
files anywhere in the repository, and the three live tables created by hand in the dashboard.

That is recorded as **BLK-1** (the baseline is reconstructed from `database.types.ts`, which
is authoritative for columns/types/enums/keys but silent on defaults, indexes, triggers and
policies) — `OPEN`, awaiting a `supabase db diff --linked` from someone with project access.

## Gate 5 — Green + aligned

Supabase CLI 2.114.0 added as a devDependency; `supabase init` created `config.toml`
(`project_id = "PakCommerceAi"`).

The baseline was verified standalone: with the four product migrations moved aside,
`supabase db reset` rebuilt the database from `0001`–`0003` alone and succeeded. That is the
property the repository never had before — a schema reproducible from source.

## Gate 7 — Scan

Migrations applied cleanly to a real Postgres 16 before the Supabase images finished
pulling, using a temporary container with a stand-in `auth` schema:

```
  ok: 20260818100001_baseline_identity_and_workspaces.sql
  ok: 20260818100002_set_updated_at_function.sql
  ok: 20260818100003_workspaces_tenant_key.sql
```

`set_updated_at()` is declared `security invoker` with `set search_path = ''` so it cannot be
hijacked by a caller-controlled search path.
