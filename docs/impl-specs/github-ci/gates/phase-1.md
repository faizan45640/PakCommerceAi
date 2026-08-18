# Phase 1 — Test harness and shared contract tests

## Gate 3 — Red

**Not satisfied as written. See AMD-2.** `packages/shared` predates this module, so tests
written from its contract go green on first run. They are recorded as characterisation
tests.

The first run was not green, however. Both test files failed at **import time**:

```
Error: .pick() cannot be used on object schemas containing refinements
 ❯ src/products/index.ts:233   productListItemSchema  = productSchema.pick({...})
 ❯ src/workspaces/index.ts:55  workspaceListItemSchema = workspaceSchema.pick({...})

 Test Files  2 failed (2)
      Tests  no tests
```

`packages/shared` threw on import and had done so since the contracts were written. It was
invisible because `tsc --noEmit` cannot see a runtime Zod restriction, and because no app
imports the package (`docs/PROJECT_CONTEXT.md` records it as orphaned).

**Fix:** extract an unrefined `productBaseSchema` / `workspaceBaseSchema`, apply
`.superRefine()` to the exported contract, and derive `*ListItemSchema` from the base. The
duplicated primary-image refinement collapsed into one `assertSinglePrimaryImage`.

## Gate 5 — Green + aligned

```
✓ src/workspaces/workspaces.test.ts (8 tests)
✓ src/products/products.test.ts (16 tests)

 Test Files  2 passed (2)
      Tests  24 passed (24)
```

Spec alignment: all 16 product tests and all 8 workspace tests named in SPEC.md §4 exist
under those names. No test was renamed or removed.

## Gate 7 — Scan

- `eslint .` — clean (replaces the previous `tsc --noEmit` masquerading as lint)
- `tsc --noEmit` — clean
- `tsc -p tsconfig.build.json` — clean; verified no `*.test.*` emitted into `dist/`
- Coverage threshold: none. Per workflow §6 thresholds apply to domain logic; this package
  *is* the domain contract and the suite exercises every exported schema's rules.
