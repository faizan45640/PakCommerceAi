# Phase Registry — `product-catalog` (T-020)

Build record for the module, per
[`implementation-workflow.md`](../../../implementation-workflow.md) §7.

| Phase | Delivered | Proof | Commit | Blockers |
|---|---|---|---|---|
| 1 | Supabase CLI, `supabase init`, baseline captured from the live project | `gates/phase-1.md` — local and production dumps diff to zero | `chore(db)`, `feat(db): baseline`, `fix(db): capture` | **BLK-1 — RESOLVED** |
| 2 | `set_updated_at()`, workspaces tenant key, three enums, `products`, `product_variants` | `gates/phase-2.md` — 27/27 red then green | `feat(db)` x4 | — |
| 3 | Table grants and RLS policies on both tables | `gates/phase-3.md` — found and fixed a real grant defect | `feat(db): access control` | — |
| 4 | Regenerated types; 27 integration tests; test tiers | `gates/phase-4.md` — 82 tests total | `test(db)`, `chore(types)` | — |
| 5 | Migration guide, runbook, project context | `gates/phase-5.md` — Open Decisions #4 and #5 answered | `docs` | **BLK-2 — RESOLVED** |
| 6 | Identity-table isolation — migration written, then deleted once the live schema showed production already had it. Tests kept and repointed at the real policies. | `gates/phase-6.md` — 41/41 green | `feat(db)`, `test(db)`, `fix(db): capture` | **BLK-3 — OPEN** |

## Totals

**96 tests**, up from 55.

| Suite | Tests | Tier |
|---|---|---|
| `packages/shared` | 24 | 1 |
| `packages/integrations` unit | 14 | 1 |
| `apps/api` | 4 | 2 |
| `apps/web` | 11 | 1 |
| `apps/ml` | 2 | 1 |
| **schema conformance** | **19** | **2** |
| **catalogue isolation** | **8** | **2** |
| **identity isolation** | **14** | **2** |

## Added beyond the original scope

Phase 6 was not in the task row. It was added because migrations became the source of schema
truth in phase 1, which made leaving three tables outside that rule an inconsistency rather
than a deferral — and because no application code queries them yet, so it cost nothing to do
now and would have cost debugging time later.

## What the tests found

Two defects that no amount of reading would have surfaced:

1. **Missing table grants.** RLS was enabled and policies written, but no role could reach
   the tables. Every seller request would have failed with `permission denied`. Caught by the
   isolation tests on their first correct run.
2. **Three identity tables readable by any logged-in user.** `profiles`, `seller_profiles`
   and `workspaces` had no RLS, so one authenticated seller could read every other seller's
   business name, phone number and workspace list. Closed in phase 6.
3. Earlier in the branch, `packages/shared` threw at import — `.pick()` on a refined Zod
   schema. Unrelated to T-020, fixed in the CI work that preceded it.

## Not done, and why

| Not done | Why |
|---|---|
| `product_images` table | Its own task. A variant `image_id` pointing at a missing table is worse than no column. |
| `categories` table | `category_ids` is a uuid array; nothing defines a category yet. |
| Full-text index on `search_text` | No query to serve yet; the shape would be a guess. |
| Applying migrations to the hosted project | BLK-2 — needs credentials and a human. |

## Precondition for opening a pull request

Workflow §7 requires this registry complete and §4.1 requires no open blocker.

- **BLK-1 — RESOLVED.** The baseline is now captured from the live project, not
  reconstructed. Verified by dumping both databases and diffing to zero.
- **BLK-2 — RESOLVED.** `supabase db push` applied migrations 0003-0007 to the hosted
  project. Verified by dumping both databases and diffing: identical, 317 lines each.
- **BLK-3 — OPEN.** `workspaces` grants `anon` more than the other identity tables do.
  Pre-existing, not introduced here, and not currently exploitable — recommended as a small
  follow-up rather than a change smuggled into T-020.

Everything in this branch was developed against a local database and has since been applied
to production, with both verified byte-for-byte identical.

**BLK-3 is the only blocker still open.** It concerns a pre-existing grant this task did not
introduce and is not exploitable today, so it does not gate this pull request — but it should
become a follow-up task rather than be forgotten.
