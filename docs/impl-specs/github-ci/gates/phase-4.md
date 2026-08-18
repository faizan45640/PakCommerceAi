# Phase 4 — CI reporting

## Gate 5 — Green + aligned

`.github/workflows/ci.yml` rewritten. Spec §4 Phase 4 clause by clause:

| # | Requirement | Where |
|---|---|---|
| 1 | Per-workspace jobs | `strategy.matrix` over shared / integrations / api / web, plus a separate `ml` job |
| 2 | Inline annotations | `--reporter=github-actions` (Vitest, built in) and `pytest-github-actions-annotate-failures` |
| 3 | Job summaries | `Summary` step appends a check table and a collapsible per-test table to `$GITHUB_STEP_SUMMARY` |
| 4 | `fail-fast: false` | set on the matrix |
| 5 | Real ESLint | `apps/api`, `packages/shared`, `packages/integrations` now run `eslint .`; `lint` and `typecheck` are no longer the same command |
| 6 | Python annotations | plugin added to `requirements-dev.txt` |
| 7 | Security jobs preserved | `security` job unchanged |

Two additions beyond the spec, both mechanical (workflow §3.4 — decide it):

- `if: ${{ !cancelled() }}` on every check step, so a lint failure does not hide the test
  result. Without it the job stops at the first red step and reports one problem when there
  may be four.
- `concurrency` keyed on `github.head_ref || github.ref_name`, so a PR branch does not run
  the same commit twice.

The per-test table is **best effort**: it is generated from Vitest's JSON reporter with
`jq` and guarded so a parsing failure cannot fail the build. The authoritative pass/fail is
the test step's exit code.

## Gate 6 — Run

Full pipeline executed locally on Windows / Node 22.13.0 / npm 11.11.0:

```
npm run lint       — all workspaces clean
npm run typecheck  — all workspaces clean
npm run test       — 53 passed (shared 24, integrations 14, api 4, web 11)
npm run build      — all workspaces succeed
pytest             — 2 passed
```

**Not yet verified on GitHub.** The workflow has not run on a runner because the branch is
not pushed and `gh auth login` is interactive. First push is the real gate-6 evidence.

## Gate 7 — Scan

No `npm audit` gate. Deliberate omission — see **BLK-2**.
