# CI/CD Guide

This document explains how automation works in PakCommerce AI and how to extend it as the project grows.

## Overview

```text
feature branch → PR → dev   (CI runs on every PR)
dev → PR → main             (CD runs when main is updated)
```

| Workflow | File | When it runs | Purpose |
|---|---|---|---|
| **CI** | `.github/workflows/ci.yml` | Push/PR to `dev` or `main` | Validate code quality |
| **CD** | `.github/workflows/cd.yml` | Push to `main`, or manual | Build + deploy artifacts |
| **Dependabot** | `.github/dependabot.yml` | Weekly | Dependency update PRs |

---

## CI pipeline

CI runs on **every pull request** and **every push** to `dev` or `main`.

### Job 1: Security checks

- Fails if secret files are tracked (`.env`, `.env.local`, keys, certs)
- Allows `.env.example` (template only)
- Requires `package-lock.json` so installs are reproducible

### Job 2: Node (monorepo)

Runs from repo root:

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
```

These commands fan out to all npm workspaces (`apps/*`, `packages/*`).

**Today:** workspaces use placeholder scripts (echo).  
**Later:** replace each workspace script with real tooling:

| App/Package | Lint | Typecheck | Test | Build |
|---|---|---|---|---|
| `apps/web` | `eslint .` | `tsc --noEmit` | `vitest run` | `vite build` |
| `apps/api` | `eslint .` | `tsc --noEmit` | `vitest run` | `tsc` |
| `packages/*` | `eslint .` | `tsc --noEmit` | `vitest run` | `tsc` |

### Job 3: ML (Python)

Runs in `apps/ml`:

```bash
pip install -r requirements-dev.txt
ruff check .
ruff format --check .
pytest tests/ -q
```

Python version is pinned in `apps/ml/.python-version` (3.12).

When you scaffold FastAPI, uncomment runtime deps in `apps/ml/requirements.txt`.

### Job 4: CI success gate

All jobs must pass before the workflow is green.

---

## CD pipeline

CD is **safe by default**: deploy steps are disabled until you opt in.

### What runs now

On push to `main` (or manual run):

1. `npm ci` + `npm run build`
2. Upload build artifacts to GitHub Actions
3. Print message that deploy is skipped

### Enable real deploys later

1. Choose hosting (e.g. Vercel for web, Railway for API/ML)
2. Add secrets in GitHub: **Settings → Secrets and variables → Actions**
3. Set repository variable: `ENABLE_CD=true`
4. Replace placeholder steps in `.github/workflows/cd.yml`

Suggested secrets (add when ready):

| Secret | Used for |
|---|---|
| `VERCEL_TOKEN` | Web frontend |
| `RAILWAY_TOKEN` | API / ML services |
| `DOCKER_REGISTRY_*` | Container deploys |

---

## Run CI locally before pushing

From repo root:

```bash
npm run ci          # Node checks only
npm run ci:ml       # ML Python checks only
./scripts/ci-local.sh   # Both
```

Run this before opening a PR to avoid CI failures on GitHub.

---

## Branch protection (recommended)

On GitHub, protect `dev` and `main`:

1. **Settings → Branches → Add rule**
2. Require pull request before merging
3. Require status checks: **CI passed** (or individual jobs)
4. Do not allow direct pushes to `main`

This matches `docs/gitworkflow.md`.

---

## Dependabot

Dependabot opens weekly PRs for:

- npm dependencies (root monorepo)
- GitHub Actions versions
- Python packages in `apps/ml`

Review and merge Dependabot PRs into `dev` like any other change.

---

## Adding CI to a new workspace

When you scaffold a new app/package:

1. Ensure it has a `package.json` with `lint`, `typecheck`, `test`, `build` scripts
2. Root scripts automatically include it via npm workspaces
3. Open a PR — CI will run the new scripts

For Python-only code, add checks under `apps/ml` or create a new workflow job.

---

## Common failures and fixes

| Failure | Fix |
|---|---|
| `npm ci` fails | Run `npm install` locally and commit updated `package-lock.json` |
| Ruff format check fails | Run `ruff format apps/ml` locally |
| Tests fail | Run `pytest apps/ml/tests` or workspace test script locally |
| `.env` committed | Remove file from git, rotate secrets, use `.env.example` only |
| CD deploy skipped | Expected until `ENABLE_CD=true` is set |

---

## File reference

```text
.github/
├── workflows/
│   ├── ci.yml           # PR/push validation
│   └── cd.yml           # Build + deploy (opt-in)
├── dependabot.yml       # Dependency updates
└── PULL_REQUEST_TEMPLATE.md

.nvmrc                   # Node 20 (used by CI)
apps/ml/
├── .python-version      # Python 3.12 (used by CI)
├── requirements-dev.txt # ruff, pytest
├── requirements.txt     # FastAPI runtime (future)
├── pyproject.toml       # Ruff/pytest config
└── tests/               # Python tests

scripts/ci-local.sh      # Run full CI locally
```
