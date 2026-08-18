# Phase 2 — Integrations and API tests

## Gate 3 — Red

`apps/api/src/app.ts` is new code, so strict §3.1 applies and was met. `createApp` was
committed as a throwing stub and the suite run:

```
FAIL src/routes/health.test.ts > health routes > GET /health returns ok
FAIL src/routes/health.test.ts > health routes > GET /api/v1 returns ok
FAIL src/routes/health.test.ts > health routes > unknown route returns 404
FAIL src/routes/health.test.ts > health routes > cors origin honours APP_URL
Error: createApp is not implemented
 ❯ createApp src/app.ts:9:9

 Test Files  1 failed (1)
      Tests  4 failed (4)
```

4/4 red with an explicit *not implemented* error — not a collection or import error.

`packages/integrations` tests are characterisation tests per AMD-2.

## Gate 5 — Green + aligned

```
✓ src/supabase/config.test.ts (11 tests)
✓ src/supabase/client.test.ts (3 tests)
 Test Files  2 passed (2)   Tests  14 passed (14)

✓ src/routes/health.test.ts (4 tests)
 Test Files  1 passed (1)   Tests  4 passed (4)
```

Spec alignment: 11 + 3 + 4 tests, all named as in SPEC.md §4.

`index.ts` retains dotenv loading and port binding; `app.ts` owns wiring only. The
`appUrl` option is the determinism seam required by workflow §5 — the CORS test injects it
rather than mutating `process.env`.

## Gate 7 — Scan

- `eslint .` in both workspaces — clean
- `tsc --noEmit` — clean
- Build via `tsconfig.build.json` — clean, no test files in `dist/`

**Finding, not a defect in this module:** `docs/PROJECT_CONTEXT.md`, `README.md` and
`docs/RUNBOOK.md` all state that `.env` resolution breaks in the production build because
`../../../.env` resolves to `apps/.env` from `dist/`. That is false. `apps/api/src` and
`apps/api/dist` sit at the same depth, so both resolve to the repository root:

```
from dist -> C:\...\PakCommerceAi\.env
from src  -> C:\...\PakCommerceAi\.env
```

Corrected in Phase 5.
