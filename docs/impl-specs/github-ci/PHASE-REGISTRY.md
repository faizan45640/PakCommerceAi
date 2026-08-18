# Phase Registry — `github-ci`

Build record for the module. One row per phase, per
[`implementation-workflow.md`](../../../implementation-workflow.md) §7.

| Phase | Delivered | Proof | Commit | Amendments / Blockers |
|---|---|---|---|---|
| 1 | Vitest harness; 24 contract tests for `packages/shared`; real ESLint for the Node workspaces | `gates/phase-1.md` — 24/24 green | `test(shared)`, `fix(shared)`, `chore(tooling)` | AMD-2. Found a live import-time crash |
| 2 | 14 tests for `packages/integrations`; 4 for `apps/api`; `createApp()` extracted | `gates/phase-2.md` — 18/18 green, gate 3 red verified for `app.ts` | `refactor(api)`, `test(api)`, `test(integrations)` | AMD-2 |
| 3 | 11 web helper tests; real ML test structure; placeholder deleted | `gates/phase-3.md` — 11/11 and 2/2 green | `test(web)`, `test(ml)` | **AMD-1 — PROPOSED** |
| 4 | `ci.yml` rewritten: per-workspace matrix, inline annotations, per-test summaries | `gates/phase-4.md` — full local run green; **not yet run on a GitHub runner** | `ci` | **BLK-1 — OPEN**, **BLK-2 — OPEN** |
| 5 | README, RUNBOOK, ci-cd.md, PROJECT_CONTEXT reconciled with verified reality | `gates/phase-5.md` | `docs` | — |

## Totals

**55 tests** — shared 24, integrations 14, api 4, web 11, ml 2.

## Not done, and why

| Not done | Why |
|---|---|
| Dashboard component tests | Components render hardcoded mock data (SPEC §2) |
| `npm audit` gate | Baseline is already red — BLK-2 |
| Branch protection | Not settable from a working tree — BLK-1 |
| Coverage thresholds | Workflow §6 — meaningless over adapters and wiring |
| Deep gate (SAST, mutation) | Workflow §6 places it before a pull request, not per phase |

## Precondition for opening a pull request

Workflow §7 requires this registry complete and, via §4.1, no open blocker. **BLK-1 and
BLK-2 are open.** They are recorded rather than closed silently: BLK-1 needs a repository
admin, BLK-2 needs a triage decision. Both are handoffs, not unfinished code.
