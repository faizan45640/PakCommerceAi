# Implementation Spec — `github-ci`

**Module:** `github-ci`
**Status:** v1.0
**Governed by:** [`../../../implementation-workflow.md`](../../../implementation-workflow.md)

---

## 1. What this module delivers

A continuous-integration pipeline that runs on every push and pull request and reports,
**per individual test**, which checks passed and which failed — visible on GitHub without
opening a log file.

Today the repository has a CI workflow, but it verifies only that the code *compiles*:

| Check | Claimed | Actual |
|---|---|---|
| `npm run test` | Runs tests | Every workspace script is an `echo`. `apps/web` has no `test` script at all, so root's `--if-present` skips it. **Zero assertions execute.** |
| `npm run lint` | Lints the monorepo | Only `apps/web` runs ESLint. `apps/api`, `packages/shared`, `packages/integrations` define `"lint": "tsc --noEmit"` — the same command as their typecheck. |
| `pytest` | Tests the ML service | One test: `assert True`. |

This module closes those gaps. It does **not** add tests for the dashboard pages: every
dashboard component renders hardcoded mock data (see `docs/PROJECT_CONTEXT.md`), so a test
over them would assert that a constant equals itself.

## 2. Scope boundary

**In scope** — the code that contains real logic today:

- `packages/shared` — Zod domain contracts (products, workspaces)
- `packages/integrations` — Supabase env-config resolution and client factories
- `apps/api` — HTTP surface
- `apps/web` — pure helper functions only (`lib/utils.ts`, preference parsing). No DOM, no component rendering, no jsdom.
- `apps/ml` — test structure and reporting only; the service has no logic yet

**Out of scope** — deliberately, with reasons:

- Dashboard component tests — the components are static mock data
- End-to-end / browser tests — there is no running backend to drive
- Coverage thresholds on `apps/web` — per workflow §6, a threshold over adapters and
  wiring measures boilerplate, not correctness
- Deploy automation — `cd.yml` stays opt-in behind `ENABLE_CD`

## 3. Determinism

Every test in this module is workflow **tier 1 (unit)** except `api-health`, which is
**tier 2 (integration)** — it binds one real dependency, an HTTP server via Supertest.
No test may require a database, a network call, or a container.

`packages/integrations` reads `process.env`. Tests must snapshot and restore the
environment around every case so ordering cannot change a result.

---

## 4. Phases

### Phase 1 — Test harness and shared contract tests

Add Vitest to the monorepo and prove the `packages/shared` contracts enforce what their
READMEs claim.

**Named tests — `packages/shared/src/products/products.test.ts`**

| Test name | Asserts |
|---|---|
| `contract version is pinned` | `productContractVersion === "2026-07-12"` |
| `money rejects fractional minor units` | `moneySchema` rejects `amountMinor: 10.5` |
| `money rejects negative amounts` | `moneySchema` rejects `amountMinor: -1` |
| `money defaults currency to PKR` | omitted `currency` parses to `"PKR"` |
| `money rejects non-PKR currency` | `currency: "USD"` is rejected |
| `product rejects two primary images` | `superRefine` raises on `images` path |
| `product accepts exactly one primary image` | single primary parses |
| `product requires at least one variant` | `variants: []` rejected |
| `product rejects more than three options` | 4 options rejected |
| `product trims and rejects blank title` | `"   "` rejected after trim |
| `create input defaults status to draft` | `createProductInputSchema` output status |
| `create input defaults collections to empty arrays` | tags/categoryIds/options/images |
| `create input enforces single primary image` | same rule on the input schema |
| `search query defaults sort and limit` | `updated_desc`, `25` |
| `search query rejects limit above 100` | `limit: 101` rejected |
| `search query requires workspace id` | missing `workspaceId` rejected |

**Named tests — `packages/shared/src/workspaces/workspaces.test.ts`**

| Test name | Asserts |
|---|---|
| `contract version is pinned` | `workspaceContractVersion === "2026-07-12"` |
| `archived workspace requires archivedAt` | archived + `null` rejected on `archivedAt` path |
| `archived workspace accepts archivedAt` | archived + timestamp parses |
| `active workspace rejects archivedAt` | active + timestamp rejected |
| `active workspace accepts null archivedAt` | active + `null` parses |
| `create input defaults isDefault to false` | output `isDefault === false` |
| `create input rejects short name` | 1-character name rejected |
| `create input trims name` | surrounding whitespace removed |

### Phase 2 — Integrations and API tests

**Named tests — `packages/integrations/src/supabase/config.test.ts`**

| Test name | Asserts |
|---|---|
| `returns null when url is missing` | |
| `returns null when key is missing` | |
| `returns null when url is whitespace only` | `readEnv` treats `"  "` as absent |
| `resolves publishable key` | happy path |
| `falls back to anon key for compatibility` | documented in `docs/supabase-setup.md` |
| `prefers publishable key over anon key` | precedence is not accidental |
| `omits service role key when absent` | key absent from object, not `undefined` |
| `includes service role key when present` | |
| `honours custom env key names` | `SupabaseEnvOptions` override |
| `assert throws on null config` | message names both required variables |
| `assert narrows a valid config` | passes through without throwing |

**Named tests — `packages/integrations/src/supabase/client.test.ts`**

| Test name | Asserts |
|---|---|
| `admin client requires service role key` | throws, message says server-side only |
| `admin client builds with service role key` | returns a client |
| `standard client disables session persistence` | server clients must not persist |

**Named tests — `apps/api/src/routes/health.test.ts`** *(tier 2)*

| Test name | Asserts |
|---|---|
| `GET /health returns ok` | `200`, `{status:"ok",service:"api"}` |
| `GET /api/v1 returns ok` | same handler, both mounts |
| `unknown route returns 404` | no catch-all swallowing routes |
| `cors origin honours APP_URL` | `access-control-allow-origin` header |

**Implementation requirement:** `apps/api/src/index.ts` calls `app.listen()` at module
scope, so importing it starts a server and it cannot be tested. Extract an
`apps/api/src/app.ts` exporting `createApp()`; `index.ts` becomes the entry point that
listens. This is the only production-code change Phase 2 makes.

### Phase 3 — Web helpers and ML structure

**Named tests — `apps/web/src/lib/utils.test.ts`**

| Test name | Asserts |
|---|---|
| `initials from a full name` | `"Talha Rana"` → `"TR"` |
| `initials from a single name` | |
| `initials collapse repeated whitespace` | the `\s+` split |
| `initials fall back for empty input` | `"?"` |
| `initials fall back for whitespace input` | `"?"` |
| `currency formats PKR` | project currency, not the `USD` default |
| `currency honours noDecimals` | |

**Named tests — `apps/web/src/lib/preferences/preferences-config.test.ts`**

| Test name | Asserts |
|---|---|
| `parses a known preference value` | |
| `falls back to default for unknown value` | guards against a poisoned cookie |
| `falls back to default for undefined` | |
| `defaults expose every registered key` | registry and defaults cannot drift |

**Named tests — `apps/ml/tests/test_package.py`**

The ML service has no logic yet, so these assert structure honestly rather than
simulating coverage:

| Test name | Asserts |
|---|---|
| `test_app_package_imports` | `app` package imports cleanly |
| `test_python_pin_matches_project_requirement` | `.python-version` agrees with `requires-python` (see AMD-1) |

`test_placeholder.py` (`assert True`) is deleted — it can never fail, so it is noise.

### Phase 4 — CI reporting

Rewrite `.github/workflows/ci.yml` so a contributor sees which tests failed without
opening a log.

Requirements:

1. **Per-workspace jobs.** `shared`, `integrations`, `api`, `web`, and `ml` report
   independently. One member's failure must not mask another's — the repo has four
   contributors working in parallel areas.
2. **Inline annotations.** Vitest's built-in `github-actions` reporter annotates the
   failing line in the PR diff. No third-party action, no `checks: write` permission.
3. **Job summaries.** Every job appends a pass/fail table to `$GITHUB_STEP_SUMMARY`, so
   the run's landing page lists results without drilling into a job.
4. **`fail-fast: false`** on the matrix — a full picture per push, not the first failure.
5. **Real ESLint** in `apps/api`, `packages/shared`, `packages/integrations`; `lint` and
   `typecheck` must stop being the same command.
6. **Python annotations** via `pytest-github-actions-annotate-failures`.
7. The existing secret-scan and lockfile jobs are preserved unchanged.

### Phase 5 — Documentation reconciliation

`README.md`, `docs/RUNBOOK.md` and `docs/ci-cd.md` state that the build fails and CI is
red. It passes — verified by a full `npm run build`, exit code 0. The fix was the
uncommitted `lucide-react` pin from `^1.23.0` to `0.577.0`.

`docs/ci-cd.md` additionally claims Node 20 (`.nvmrc` says 22) and `vite build`
(the project uses Next.js and `tsc`).

All three must describe the pipeline this module ships.

---

## 5. Definition of done

- Every test named in §4 exists, by that name
- `npm run test` executes real assertions in all four Node workspaces
- `npm run lint` runs ESLint — not `tsc` — in every Node workspace
- A deliberately broken assertion produces a named, inline failure on GitHub
- `PHASE-REGISTRY.md` is complete and `BLOCKERS.md` has no `OPEN` entry
