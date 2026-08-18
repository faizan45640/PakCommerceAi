# Phase Registry — `product-catalog` (T-020)

Build record for the module, per
[`implementation-workflow.md`](../../../implementation-workflow.md) §7.

| Phase | Delivered | Proof | Commit | Blockers |
|---|---|---|---|---|
| 1 | Supabase CLI, `supabase init`, baseline of the three pre-existing tables | `gates/phase-1.md` — baseline rebuilds standalone | `chore(db)`, `feat(db): baseline` | **BLK-1 — OPEN** |
| 2 | `set_updated_at()`, workspaces tenant key, three enums, `products`, `product_variants` | `gates/phase-2.md` — 27/27 red then green | `feat(db)` x4 | — |
| 3 | Table grants and RLS policies on both tables | `gates/phase-3.md` — found and fixed a real grant defect | `feat(db): access control` | — |
| 4 | Regenerated types; 27 integration tests; test tiers | `gates/phase-4.md` — 82 tests total | `test(db)`, `chore(types)` | — |
| 5 | Migration guide, runbook, project context | `gates/phase-5.md` — Open Decisions #4 and #5 answered | `docs` | **BLK-2 — OPEN** |

## Totals

**82 tests**, up from 55.

| Suite | Tests | Tier |
|---|---|---|
| `packages/shared` | 24 | 1 |
| `packages/integrations` unit | 14 | 1 |
| `apps/api` | 4 | 2 |
| `apps/web` | 11 | 1 |
| `apps/ml` | 2 | 1 |
| **schema conformance** | **19** | **2** |
| **tenant isolation** | **8** | **2** |

## What the tests found

Two defects that no amount of reading would have surfaced:

1. **Missing table grants.** RLS was enabled and policies written, but no role could reach
   the tables. Every seller request would have failed with `permission denied`. Caught by the
   isolation tests on their first correct run.
2. Earlier in the branch, `packages/shared` threw at import — `.pick()` on a refined Zod
   schema. Unrelated to T-020, fixed in the CI work that preceded it.

## Not done, and why

| Not done | Why |
|---|---|
| `product_images` table | Its own task. A variant `image_id` pointing at a missing table is worse than no column. |
| `categories` table | `category_ids` is a uuid array; nothing defines a category yet. |
| RLS on `profiles`, `seller_profiles`, `workspaces` | They predate the decision; changing them is outside T-020. Should be next. |
| Full-text index on `search_text` | No query to serve yet; the shape would be a guess. |
| Applying migrations to the hosted project | BLK-2 — needs credentials and a human. |

## Precondition for opening a pull request

Workflow §7 requires this registry complete and §4.1 requires no open blocker. **BLK-1 and
BLK-2 are open**, and both need someone with Supabase project access:

- BLK-1 — run `supabase db diff --linked` and fold any difference into the baseline. Until
  then the baseline is a good reconstruction, not a verified fact.
- BLK-2 — run `supabase db push` to apply these migrations to the hosted database.

Everything in this branch was developed and verified against a local database built from
these migrations alone.
