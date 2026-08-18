# Phase 5 — Documentation

## Gate 5 — Green + aligned

| Document | Change |
|---|---|
| `docs/supabase-setup.md` | New **Migrations** section: running the database locally, `db reset`, the five rules for writing a migration, regenerating types, running the tests, and the deploy commands |
| `docs/RUNBOOK.md` | Local database added to "what you can actually run"; Docker added to prerequisites; a **Database tests** section |
| `docs/PROJECT_CONTEXT.md` | Core Domain: Product now ✅, Inventory now partly built. Database section rewritten — five tables, five enums, migrations exist. Multi-tenant warning narrowed to the truth: enforced for the catalogue, still absent on the three older tables |

Open Decisions resolved:

- **#4 — tenant isolation:** answered. Postgres RLS, shipped in the same migration as the
  table. `createApiSupabaseAdminClient()` is the exception, not the norm.
- **#5 — migrations:** answered. `supabase/migrations/`, Supabase CLI, append-only, one file
  one responsibility.
- **#6 — currency:** partly answered. Storage carries an explicit currency column, so
  widening needs no migration. The application contract is still PKR-only — that half stays
  open.

## Open at module close

- **BLK-1** — the baseline is reconstructed, not captured. `OPEN`.
- **BLK-2** — no credentials to apply migrations to the hosted project. `OPEN`.

Neither is unfinished code. Both need a human with access.
