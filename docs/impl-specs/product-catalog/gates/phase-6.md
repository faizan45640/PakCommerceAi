# Phase 6 — RLS on the identity tables

Added after the module's original scope, at the task owner's request: since migrations are
now the only source of schema truth, the three pre-existing tables should be brought under
the same rule rather than left as an exception.

## Gate 2 — Reconcile

Before touching them, checked what would break:

```
grep -rn "\.from(" apps/web/src apps/api/src   →  only Array.from()
```

**No application code queries any table yet.** That makes this the cheapest possible moment
to enable RLS — there is no existing behaviour depending on the tables being open. Doing it
after the dashboards are wired to real data would mean debugging empty screens instead.

## Gate 3 — Red

Migration `0008` moved aside, database reset, suite run:

```
Tests  10 failed | 4 passed (14)

AssertionError: expected 1 to be +0     ← seller CAN hard delete a workspace
AssertionError: expected [ 3 rows ] to equal [ 1 row ]   ← seller reads everyone's profiles
```

Assertion failures, not errors — the tests describe a boundary that genuinely did not exist.

The 4 that passed are correct: three anonymous-access cases (already blocked by the absence
of a grant, from migration `0001`) and "seller can archive their own workspace", which works
with or without a policy. A test that passes before the feature exists is worth noticing —
these three pass because a *different* mechanism already covers them, which is the layering
working as intended.

## Gate 5 — Green + aligned

```
✓ identity-rls.itest.ts  (14 tests)
✓ rls.itest.ts           ( 8 tests)
✓ schema.itest.ts        (19 tests)
  Tests  41 passed (41)
```

Policy set, and the reasoning:

| Table | select | insert | update | delete |
|---|---|---|---|---|
| `profiles` | own | own | own | **none** — cascades from `auth.users` |
| `seller_profiles` | own | own | own | **none** — same |
| `workspaces` | own | own | own (+`with check`) | **none** — archive instead |

No delete policy on workspaces is the significant one. Deleting a workspace cascades to every
product and variant in it, and the workspace contract already models retirement as
`status = 'archived'` with a timestamp. Archiving is reversible and auditable; a hard delete
triggered by one client request is neither. Service-role code can still delete when a seller
genuinely asks to erase their data.

The migration is **idempotent** — `enable row level security` is safe to repeat and each
policy is dropped before creation. That is because the hosted database's policy state is
unknown (BLK-1): Supabase's dashboard enables RLS by default on tables created through it, so
these may already be protected there. The migration converges to a known state either way.

## Gate 7 — Scan

`eslint`, `tsc --noEmit`, `npm run test` (53) and `npm run build` all clean.

**Known gap, recorded rather than hidden:** `seller_profiles.verification_status` is writable
by the seller under `seller_profiles_update_own`. A seller should not be able to mark
themselves `verified`. Restricting one column needs a column-level grant or a trigger, and
doing it properly belongs with the verification feature, which does not exist yet. Noted in
the migration at the site.
