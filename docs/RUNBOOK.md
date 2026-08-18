# Runbook — Installing and Running PakCommerce AI

Everything needed to get this repository running on a fresh machine.

Written and verified on **Windows 10 + PowerShell**, Node 22.13.0, npm 11.11.0. Commands are noted where macOS/Linux differs.

---

## 1. What you can actually run

| Service | Workspace | Port | State |
|---|---|---|---|
| Seller dashboard | `apps/web` | **3000** | ✅ Runs. All pages render mock data. |
| Backend API | `apps/api` | **4000** | ✅ Runs. Health endpoint only. |
| ML service | `apps/ml` | — | ❌ **Nothing to run.** Not scaffolded yet. |

Do not expect the dashboards to show real data — none of them are wired to a database or to the API. See the status table in the [README](../README.md).

---

## 2. Prerequisites

| Tool | Version | Required for | Check |
|---|---|---|---|
| **Node.js** | **22 or higher** (pinned in `.nvmrc`) | Everything | `node -v` |
| **npm** | 10+ (ships with Node 22) | Everything | `npm -v` |
| **Git** | any recent | Cloning | `git --version` |
| **Python** | **3.12** (pinned in `apps/ml/.python-version`) | ML **CI checks only** | `python --version` |

Node 22 is enforced by `engines` in the root `package.json`. Older versions will fail or behave unpredictably.

Python is **not needed to run the app** — only for `npm run ci:ml`. Skip it for now if you are working on web or api.

Using `nvm`:

```bash
nvm install 22
nvm use 22
```

---

## 3. Clone and install

```bash
git clone https://github.com/faizan45640/PakCommerceAi.git
cd PakCommerceAi
git checkout dev
npm install
```

**Install from the repository root only.** This is an npm workspaces monorepo — a single root `npm install` installs every app and package and links the internal `@pakcommerce/*` packages. Running `npm install` inside `apps/web` or `apps/api` will produce a broken, half-linked tree.

The install pulls ~740 packages and takes **2–4 minutes**. Let it finish — interrupting it leaves a corrupt `node_modules` (see [Troubleshooting](#8-troubleshooting)).

### Verify the install worked

```bash
node -e "console.log(require('next/package.json').version)"   # → 16.2.12
```

On Windows, also confirm the binaries were linked:

```powershell
Test-Path node_modules\.bin\next.cmd    # → True
Test-Path node_modules\.bin\tsx.cmd     # → True
```

If either is `False`, the install did not complete. Re-run `npm install`.

---

## 4. Environment variables

Neither service currently *requires* env vars to boot, but Supabase auth will not work without them.

> ⚠️ **Two separate files are needed.** Next.js does **not** read the monorepo-root `.env`. This is the single most common setup mistake in this repo — `docs/supabase-setup.md` is misleading on this point.

| File | Read by | Loaded how |
|---|---|---|
| `.env` (repo root) | `apps/api` | `dotenv` in `apps/api/src/index.ts` |
| `apps/web/.env.local` | `apps/web` | Next.js built-in |

Both are gitignored. **Never commit either one** — CI has a job that fails the build if it detects a tracked `.env`.

### Step 1 — root `.env` (for the API)

```bash
cp .env.example .env
```

Fill in what you have. The API boots fine with all of it blank.

### Step 2 — `apps/web/.env.local` (for the dashboard)

Create it manually with the two browser-facing values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-publishable-key>
```

Get both from the Supabase dashboard → **Project Settings → API**.

### Variable reference

| Variable | Used by | Needed to run? | Notes |
|---|---|---|---|
| `API_PORT` | api | No — defaults to `4000` | |
| `APP_URL` | api | No — defaults to `http://localhost:3000` | Sets the CORS origin |
| `NEXT_PUBLIC_SUPABASE_URL` | web | Only for auth | Exposed to the browser |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | web | Only for auth | Exposed to the browser — **publishable key only** |
| `SUPABASE_URL` | api | Only for Supabase calls | |
| `SUPABASE_PUBLISHABLE_KEY` | api | Only for Supabase calls | `SUPABASE_ANON_KEY` still accepted for compatibility |
| `SUPABASE_SERVICE_ROLE_KEY` | api | Only for admin client | **Server-only. Bypasses RLS. Never expose.** |
| `DATABASE_URL`, `JWT_SECRET` | — | No | Present in `.env.example` but **unused by any code today** |

---

## 5. Running

### Both services, one command

```powershell
npx concurrently -n "web,api" -c "cyan,magenta" "npm run dev -w @pakcommerce/web" "npm run dev -w @pakcommerce/api"
```

`Ctrl+C` stops both.

> **PowerShell users:** keep the quotes around `"web,api"` and `"cyan,magenta"`. Unquoted, PowerShell splits on the comma and both processes end up sharing one confusing label.

### Or one service per terminal

Often better — you get clean, separate logs.

```bash
npm run dev -w @pakcommerce/web     # → http://localhost:3000
```

```bash
npm run dev -w @pakcommerce/api     # → http://localhost:4000
```

Both use watch mode: `next dev` for web, `tsx watch` for api. Saving a file reloads automatically.

### Expected output

```text
[web] ▲ Next.js 16.2.12 (Turbopack)
[web] - Local:  http://localhost:3000
[web] ✓ Ready in 2.0s
[api] API running at http://localhost:4000
```

### There is no root `npm run dev`

`npm run dev` from the repo root **fails** with `Missing script: "dev"`. That is expected — the root `package.json` defines only `lint`, `typecheck`, `test`, `build`, `ci`, and `ci:ml`.

To enable it, add these to the root `scripts` block (`concurrently` is already a root devDependency):

```json
"dev": "concurrently -n \"web,api\" -c \"cyan,magenta\" \"npm:dev:web\" \"npm:dev:api\"",
"dev:web": "npm run dev -w @pakcommerce/web",
"dev:api": "npm run dev -w @pakcommerce/api"
```

---

## 6. Verifying it works

### API

```bash
curl http://localhost:4000/health
curl http://localhost:4000/api/v1
```

Both must return:

```json
{"status":"ok","service":"api"}
```

These are the **only two endpoints that exist**, and they share one handler.

### Web

| Route | Expected |
|---|---|
| `/` | 307 redirect → `/dashboard/sales-and-orders` |
| `/dashboard` | 307 redirect → `/dashboard/sales-and-orders` |
| `/dashboard/sales-and-orders` | 200 |
| `/dashboard/inventory-management` | 200 |
| `/dashboard/ai-insights-and-copilot` | 200 |
| `/dashboard/ai-sales-agent` | 200 |
| `/dashboard/logistics-and-courier` | 200 |
| `/dashboard/account-settings` | 200 |
| `/auth/v1/login` | 200 (UI only — submitting shows a toast, does not log in) |
| `/auth/v1/register` | 200 (UI only) |

The first request to each route compiles it on demand and can take 5–20 seconds. Subsequent loads are fast.

---

## 7. Other commands

### Quality checks

```bash
npm run lint         # all workspaces — ✅ passes (real ESLint everywhere)
npm run typecheck    # all workspaces — ✅ passes
npm run test         # all workspaces — ✅ 53 Node tests pass
npm run build        # all workspaces — ✅ passes
npm run ci           # lint + typecheck + test + build
```

Run one workspace's tests while you work:

```bash
npm run test -w @pakcommerce/shared          # 24 tests
npm run test -w @pakcommerce/integrations    # 14 tests
npm run test -w @pakcommerce/api             #  4 tests
npm run test -w @pakcommerce/web             # 11 tests
```

Watch mode, for the workspace you are editing:

```bash
npx vitest --root packages/shared
```

> **Historical note.** Earlier revisions of this runbook said `npm run build` failed while
> prerendering `/dashboard/account-settings` with
> `InvariantError: Expected workStore to be initialized`. The cause was `lucide-react` v1
> (see [Troubleshooting](#8-troubleshooting)); the dependency is now pinned to `0.577.0`
> and the build passes.

Scope any of them to one workspace with `-w`:

```bash
npm run typecheck -w @pakcommerce/web
```

### Python / ML checks

```bash
npm run ci:ml
```

Runs `pip install -r requirements-dev.txt`, `ruff check .`, `ruff format --check .`, `pytest tests/ -q` inside `apps/ml`. Only a placeholder test exists.

> Uses `python3`. On Windows, where the executable is usually `python`, run the steps manually from `apps/ml` or use WSL/Git Bash.

### Full local CI (Git Bash / WSL / macOS / Linux)

```bash
./scripts/ci-local.sh
```

Runs `npm ci` — which **deletes and reinstalls `node_modules`** from the lockfile. Expect several minutes.

### Production build

```bash
npm run build -w @pakcommerce/api
npm run start -w @pakcommerce/api     # node dist/index.js
```

```bash
npm run build -w @pakcommerce/web
npm run start -w @pakcommerce/web     # next start
```

> **Previously reported as a bug, and it is not one.** `apps/api/src/index.ts` resolves
> `.env` via `../../../.env`. `apps/api/src` and `apps/api/dist` sit at the same depth, so
> both resolve to the monorepo root. Verified:
>
> ```text
> from dist -> <repo>/.env
> from src  -> <repo>/.env
> ```

---

## 8. Troubleshooting

### `npm error Missing script: "dev"`

Expected. There is no root `dev` script — see [section 5](#5-running).

### `Turbopack is not supported on this platform (win32/x64) because native bindings are not available`

The `@next/swc-win32-x64-msvc` native binary is corrupt or truncated, usually from an interrupted `npm install`. Next falls back to WASM, and Turbopack refuses to start.

Verify — the `.node` file should be ~137 MB:

```powershell
Get-ChildItem node_modules\@next\swc-win32-x64-msvc\*.node | Select-Object Name,Length
```

Fix:

```powershell
Remove-Item -Recurse -Force node_modules\@next\swc-win32-x64-msvc
npm install
```

Temporary workaround without reinstalling: `npx next dev --webpack` from `apps/web`.

### Every page returns 500: `react.createContext is not a function`

Caused by `lucide-react` v1.x. Version 1.x calls `createContext` at module scope without a `"use client"` directive, which crashes any React Server Component that imports an icon — which is most pages here.

`apps/web/package.json` must pin an exact 0.x version:

```json
"lucide-react": "0.577.0"
```

If it has drifted back to `^1.x`:

```bash
npm install lucide-react@0.577.0 -w @pakcommerce/web --save-exact
```

Restart the dev server afterwards.

### `node_modules/.bin` does not exist / `'next' is not recognized`

The install was interrupted. Re-run `npm install` from the repo root and let it finish.

### `TS7016: Could not find a declaration file for module 'simple-icons'`

The installed `simple-icons` package is missing its `.d.ts` files — another symptom of an interrupted install. The published package **does** ship `index.d.ts`, so this is local corruption, not an upstream problem.

```powershell
Remove-Item -Recurse -Force node_modules\simple-icons
npm install
```

Do **not** "fix" this by adding a `declare module 'simple-icons'` shim or installing `@types/simple-icons` — that hides real corruption and throws away the package's own types.

> **General rule:** if you interrupted an `npm install`, assume several packages extracted partially. Symptoms show up in unrelated places (missing binaries, missing type declarations, truncated `.node` files). The reliable fix is a clean reinstall:
>
> ```powershell
> Remove-Item -Recurse -Force node_modules
> npm ci
> ```

### `EADDRINUSE` — port 3000 or 4000 already in use

```powershell
# Windows — find and kill
netstat -ano | findstr :3000
taskkill /PID <pid> /F
```

```bash
# macOS / Linux
lsof -ti:3000 | xargs kill -9
```

Or change the API port with `API_PORT=4001` in the root `.env`.

### Supabase env vars are set but the web app ignores them

They are in the wrong file. Next.js does not read the monorepo-root `.env` — web variables belong in `apps/web/.env.local`. See [section 4](#4-environment-variables).

### `Supabase web client is not configured`

`NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is missing from `apps/web/.env.local`. Restart the dev server after adding them — Next.js only reads env files at startup.

### `npm ci` fails in CI

Your `package-lock.json` is out of sync. Run `npm install` locally and commit the updated lockfile.

### Login form does not log me in

Working as built. `login-form.tsx` currently just displays a toast with the submitted values — Supabase authentication is not wired up yet.

---

## 9. Ports and URLs

| What | URL |
|---|---|
| Seller dashboard | <http://localhost:3000> |
| Dashboard landing | <http://localhost:3000/dashboard/sales-and-orders> |
| Login page | <http://localhost:3000/auth/v1/login> |
| API health | <http://localhost:4000/health> |
| API v1 root | <http://localhost:4000/api/v1> |

---

## 10. Daily workflow

```bash
git checkout dev
git pull origin dev
npm install                 # only if package.json / lockfile changed
git checkout -b feature/sXX-tXXX-short-name-yourname

# start the servers, do the work

npm run lint && npm run typecheck    # before pushing
git add . && git commit -m "feat(scope): description"
git push -u origin feature/sXX-tXXX-short-name-yourname
```

Then open a PR into `dev` — never into `main`. Full rules in [`gitworkflow.md`](gitworkflow.md).
