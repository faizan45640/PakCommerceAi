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

### Job 2: Node (one job per workspace)

A build matrix runs `shared`, `integrations`, `api` and `web` as **four independent jobs**
with `fail-fast: false`. Four people work on this repo in parallel; one member's red
workspace must never hide another's result.

Each job runs from the repo root — this is an npm workspaces monorepo and the internal
`@pakcommerce/*` links only resolve from there:

```bash
npm ci
npm run lint      -w <workspace>
npm run typecheck -w <workspace>
npm run test      -w <workspace>
npm run build     -w <workspace>
```

Every step carries `if: ${{ !cancelled() }}`, so a lint failure does not stop the job before
the tests run. You get all four results from one push, not the first one that broke.

| App/Package | Lint | Typecheck | Test | Build |
|---|---|---|---|---|
| `apps/web` | `eslint` | `tsc --noEmit` | `vitest run` | `next build` |
| `apps/api` | `eslint .` | `tsc --noEmit` | `vitest run` | `tsc -p tsconfig.build.json` |
| `packages/shared` | `eslint .` | `tsc --noEmit` | `vitest run` | `tsc -p tsconfig.build.json` |
| `packages/integrations` | `eslint .` | `tsc --noEmit` | `vitest run` | `tsc -p tsconfig.build.json` |

`tsconfig.build.json` exists so `*.test.ts` is excluded from `dist/` while still being
typechecked by `tsc --noEmit`.

### Reading a failed run

Three places, in increasing detail:

1. **The PR checks list** — names the workspace that failed (`shared`, `api`, …).
2. **The run summary page** — a table per workspace showing which of lint / typecheck /
   test / build failed, plus a collapsible list of every individual test with ✅ or ❌.
3. **Inline annotations** — a failed assertion is annotated on the exact line in the PR
   diff. Vitest's built-in `github-actions` reporter and
   `pytest-github-actions-annotate-failures` produce these; no third-party action and no
   `checks: write` permission is needed.

### Job 3: ML (Python)

Runs in `apps/ml`:

```bash
pip install -r requirements-dev.txt
ruff check .
ruff format --check .
pytest tests/ -q
```

Python version is pinned in `apps/ml/.python-version` (3.12) and asserted by `tests/test_package.py`, which fails if it drifts from `requires-python` in `pyproject.toml`.

When you scaffold FastAPI, uncomment runtime deps in `apps/ml/requirements.txt`.

### Job 4: CI success gate

All jobs must pass before the workflow is green.

---

## CD pipeline

Deploys are owned by the hosting platforms' Git integrations, so no deploy
tokens or CD variables are needed in GitHub.

### What runs now

On push to `main` (or manual run), the workflow:

1. runs `npm ci` + `npm run build`
2. uploads build artifacts to GitHub Actions
3. prints which platform owns each deploy

| Component | Platform | Trigger |
|---|---|---|
| Web | Netlify Git integration | Push to `dev` |
| API | Render Blueprint (`render.yaml`) | Push to `dev` **after CI checks pass** |
| ML | Nothing yet | `apps/ml` has no service |

The database is **not** deployed by this workflow — Supabase migrations are pushed
separately (step 1 below).

### First-time setup

#### 1. Supabase (database + auth)

The database already lives in Supabase, but production needs its own project:

```bash
supabase login
supabase link --project-ref <production-project-ref>
supabase db push
```

Run migrations before the first API deploy; the API assumes the schema exists.

#### 2. Render (API)

1. In the Render Dashboard choose **New → Blueprint**, connect this repo, and
   select the **`dev`** branch. Render reads `render.yaml` and creates a Docker
   web service named `pakcommerce-api` in Singapore on the free plan.
   If the service already exists, change its branch to `dev` under
   **Settings → Build & Deploy**.
2. When prompted, fill the `sync: false` environment variables:
   - `APP_URL` — the Netlify production URL. You can set a placeholder now and
     correct it after step 3; comma-separate preview URLs if needed.
   - `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `JWT_SECRET`
   - `GOOGLE_GENERATIVE_AI_API_KEY` (or `DEEPSEEK_API_KEY` / `OPENROUTER_API_KEY`)
3. Deploy. `autoDeployTrigger: checksPass` means later pushes to `dev` ship only
   after the GitHub CI checks are green.
4. Copy the service URL, e.g. `https://pakcommerce-api.onrender.com`.

> The free plan spins the service down after ~15 minutes idle. The first request
> afterwards takes 30–60 seconds while it cold-starts. Fine for demos; upgrade to
> the Starter plan if that is unacceptable.

#### 3. Netlify (web)

1. In Netlify choose **Add new site → Import an existing project** and pick this repo.
2. Leave **Base directory** and **Package directory** unset. Netlify then runs
   at the repo root, using the root `netlify.toml`:
   - build command `npm run build -w @pakcommerce/web`
   - publish directory `apps/web/.next`
   - Node 22 and `@netlify/plugin-nextjs`
3. Add environment variables (Netlify UI → **Site configuration → Environment variables**):
   - `NEXT_PUBLIC_API_URL` — the Render API URL from step 2
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
4. Set the **production branch** to `dev` under **Site configuration →
   Build & deploy → Branches** (Netlify defaults to the repo's default branch).
5. Deploy. Netlify redeploys automatically on every push to `dev`, and can build
   Deploy Previews for pull requests once the same variables are enabled for the
   *Deploy previews* scope.
6. Back on Render, update `APP_URL` to the Netlify production URL and redeploy so
   the API's CORS policy allows the browser.

No GitHub secrets are needed for either deploy.

### Verify a deploy

```bash
curl https://<render-domain>/health
# {"status":"ok","service":"api"}

curl -H "Origin: https://<netlify-domain>" -I https://<render-domain>/health
# access-control-allow-origin: https://<netlify-domain>
```

If the browser gets CORS errors, `APP_URL` on Render does not match the deployed
web origin exactly (scheme included, no trailing slash).

---

## Run CI locally before pushing

From repo root:

```bash
npm run ci          # Node checks only
npm run ci:ml       # ML Python checks only
./scripts/ci-local.sh   # Both
```

> On Windows `npm run ci:ml` calls `python3`, which usually does not exist. Run the steps
> from `apps/ml` with `python -m pytest tests/ -v`, or use Git Bash / WSL.

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
| Render deploy skipped | The `dev` CI checks have not passed yet (`autoDeployTrigger: checksPass`) |

---

## File reference

```text
.github/
├── workflows/
│   ├── ci.yml           # PR/push validation
│   └── cd.yml           # Build + deploy (opt-in)
├── dependabot.yml       # Dependency updates
└── PULL_REQUEST_TEMPLATE.md

.nvmrc                   # Node 22 (used by CI)
apps/ml/
├── .python-version      # Python 3.12 (used by CI)
├── requirements-dev.txt # ruff, pytest
├── requirements.txt     # FastAPI runtime (future)
├── pyproject.toml       # Ruff/pytest config
└── tests/               # Python tests

scripts/ci-local.sh      # Run full CI locally
```
