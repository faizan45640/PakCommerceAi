# Phase 5 — Documentation reconciliation

## Gate 5 — Green + aligned

Every claim below was verified by running the command, not by reading code.

| Document | Claim removed | Verified reality |
|---|---|---|
| `README.md` | "CI is currently red on `dev`" | `npm run ci` passes end to end |
| `README.md` | `packages/shared` "Written, unused" | now "Written, unused, tested" — 24 tests |
| `docs/RUNBOOK.md` | "`npm run build` is currently broken" | passes; cause was `lucide-react` v1 |
| `docs/RUNBOOK.md` | "`npm start` will silently skip your environment variables" | false — `src/` and `dist/` are the same depth |
| `docs/ci-cd.md` | "workspaces use placeholder scripts (echo)" | real ESLint, Vitest and pytest |
| `docs/ci-cd.md` | "`vite build`" | `next build` / `tsc -p tsconfig.build.json` |
| `docs/ci-cd.md` | ".nvmrc — Node 20" | Node 22 |
| `docs/PROJECT_CONTEXT.md` | four stale defect rows | moved to a "Resolved since the last revision" table with the actual cause |

Added rather than corrected:

- `README.md` — test-suite table and how CI reports results
- `docs/RUNBOOK.md` — per-workspace test commands and watch mode
- `docs/ci-cd.md` — "Reading a failed run", and a Windows note for `npm run ci:ml`
  (it calls `python3`, which usually does not exist there)
- `docs/PROJECT_CONTEXT.md` — two live defects that had no record: the 8 npm advisories
  and the absence of branch protection

## Gate 7 — Scan

Documentation phase; no code changed. Every internal link target checked to exist.

## Open at module close

- **BLK-1** (branch protection) — `OPEN`, requires a repository admin
- **BLK-2** (npm advisories) — `OPEN`, requires triage
- **AMD-1**, **AMD-2** — `PROPOSED`, require a human decision

Per workflow §4.1 no further phase of this module starts while a blocker is open.
