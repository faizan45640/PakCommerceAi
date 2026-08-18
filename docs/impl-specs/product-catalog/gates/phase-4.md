# Phase 4 — Types and conformance tests

## Gate 5 — Green + aligned

`database.types.ts` regenerated from the local schema:

```
product_variants · products · profiles · seller_profiles · workspaces

Enums:
  inventory_state: "in_stock" | "low_stock" | "out_of_stock" | "untracked"
  product_status: "draft" | "active" | "archived"
  product_variant_status: "active" | "inactive"
```

All 27 tests named in SPEC §5 exist under those names: 19 schema, 8 RLS.

## Gate 6 — Run

Full monorepo, on Windows / Node 22.13.0 / Docker 29.6.1:

```
npm run lint                                        clean
npm run typecheck                                   clean
npm run test                 53 passed  (shared 24, integrations 14, api 4, web 11)
npm run test:integration     27 passed  (schema 19, rls 8)
npm run build                clean
pytest                        2 passed
```

**82 tests.** Before T-020 there were 55, and none of them touched a database.

## Gate 7 — Scan

Test tiers are enforced mechanically, not by convention: `vitest.config.ts` includes only
`*.test.ts` and `vitest.integration.config.ts` only `*.itest.ts`. `npm run test` therefore
stays runnable with no Docker, which matters because four people work here and not all of
them will have the stack running.

Integration tests are single-threaded (`fileParallelism: false`) — each wraps itself in a
transaction it rolls back, and parallel workers on one connection would interleave those
unpredictably.

`tsconfig.build.json` excludes `*.test.ts`, `*.itest.ts` and `testing/`; verified that
`dist/` contains only the seven production modules.
