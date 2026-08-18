# PakCommerce AI

An AI-powered **operations layer** for Pakistani ecommerce sellers. It sits on top of the systems sellers already use — Shopify, WooCommerce, WhatsApp, local couriers — and centralises products, inventory, orders, conversations, courier data, and business insights into one workspace.

PakCommerce AI is **not** a marketplace, a Shopify/WooCommerce replacement, a courier company, or an ERP.

Final Year Project — Department of Computer Science, UET Lahore (New Campus), session 2023–2027.

---

## ⚠️ Read this before anything else

This repository is **early-stage**. The target system describes the **complete operational layer**. Most advanced features are **under active development**.

| | |
|---|---|
| **Proposal** | The 20-week target. Aspirational. |
| **This codebase** | Roughly **end of Phase 3 of 8**. |
| **Built so far** | Auth + workspace DB schema, 6 dashboard screens on **mock data**, a health-check API. |
| **Not started** | Store connectors, sync engine, WhatsApp agent, Business Copilot, RAG, ML/COD risk model, courier scoring, audit logs. |

When a document describes a feature, check the status table below before assuming it exists.

**To run the project → [`docs/RUNBOOK.md`](docs/RUNBOOK.md)**

---

## Status by workspace

| Workspace | Package | State | What is actually there |
|---|---|---|---|
| `apps/web` | `@pakcommerce/web` | 🟡 **Partial** | Next.js 16 App Router. 6 dashboard pages, all rendering **hardcoded mock data**. Login/register **UI only** — the forms do not authenticate. |
| `apps/api` | `@pakcommerce/api` | 🔴 **Skeleton** | Express 5 server. Exactly one route (`health`), mounted at `/health` and `/api/v1`. No business endpoints. |
| `apps/ml` | `@pakcommerce/ml` | ⚪ **Not scaffolded** | Config only (ruff, pytest, Python pin). No FastAPI app, no model. Runtime deps are commented out. |
| `packages/shared` | `@pakcommerce/shared` | 🟡 **Written, unused, tested** | Zod contracts for products + workspaces, covered by 24 tests. **No app depends on it yet.** |
| `packages/integrations` | `@pakcommerce/integrations` | 🟢 **Working** | Supabase client/admin factories + generated DB types. Used by both web and api. |
| `packages/ai` | `@pakcommerce/ai` | ⚪ **Empty stub** | Placeholder scripts only. |

### Database

Three tables exist in Supabase: `profiles`, `seller_profiles`, `workspaces` (plus enums `seller_verification_status`, `workspace_status`). Products, inventory, orders, customers, conversations, couriers, and audit tables **do not exist yet**.

> ⚠️ There is no `supabase/migrations/` directory in this repo. The current schema is **not reproducible from source** — see Open Decisions in [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md).

---

## Repository structure

```text
├── apps/
│   ├── web/                    # Next.js 16 seller dashboard (port 3000)
│   ├── api/                    # Express 5 backend (port 4000)
│   └── ml/                     # Python FastAPI ML service (not scaffolded)
├── packages/
│   ├── shared/                 # Zod domain contracts (products, workspaces)
│   ├── integrations/           # Supabase clients + generated DB types
│   └── ai/                     # AI/agent code (empty)
├── docs/
│   ├── PROJECT_CONTEXT.md      # Vision, domain, principles, invariants
│   ├── RUNBOOK.md              # How to install and run  ← start here
│   ├── supabase-setup.md       # Supabase env + client usage
│   ├── ci-cd.md                # CI/CD guide
│   └── gitworkflow.md          # Branching + PR rules
├── scripts/
│   └── ci-local.sh             # Run full CI locally
└── package.json                # npm workspaces root
```

---

## Tech stack (as actually installed)

| Layer | Technology |
|---|---|
| Frontend | Next.js 16.2.12 (App Router, Turbopack), React 19.2.4, TypeScript 5 |
| Styling | Tailwind CSS v4, shadcn/ui, Radix UI, Recharts |
| Backend | Node 22, Express 5.2.1, `tsx` for dev |
| Database / Auth | Supabase (PostgreSQL), `@supabase/ssr` |
| Validation | Zod 4 |
| ML | Python 3.12, ruff, pytest — *scikit-learn / FastAPI not yet added* |
| Monorepo | npm workspaces (no Turborepo/Nx) |

Planned but **not yet installed**: LangGraph, Vercel AI SDK, Twilio, scikit-learn, pgvector, Redis/BullMQ, courier SDKs.

---

## Quick start

Full instructions, prerequisites, environment variables, and troubleshooting are in **[`docs/RUNBOOK.md`](docs/RUNBOOK.md)**.

```bash
npm install
npx concurrently -n "web,api" -c "cyan,magenta" \
  "npm run dev -w @pakcommerce/web" \
  "npm run dev -w @pakcommerce/api"
```

- Web → <http://localhost:3000>
- API → <http://localhost:4000/health>

> There is **no root `npm run dev` script**. Use the command above or run each workspace separately. See the runbook.

---

## CI/CD

- **CI** runs on **every push to every branch** and on PRs into `dev` or `main`: secret scan → install → lint → typecheck → test → build per workspace, plus a Python job (ruff + pytest) for `apps/ml`.

### Test suite

| Workspace | Tests | Covers |
|---|---|---|
| `packages/shared` | 24 | Product and workspace Zod contracts — money in PKR minor units, single-primary-image, variant/option limits, archive invariant, search defaults |
| `packages/integrations` | 14 | Supabase env resolution, the `SUPABASE_ANON_KEY` fallback, service-role handling, client factory options |
| `apps/api` | 4 | Health route on both mounts, 404 behaviour, CORS origin |
| `apps/web` | 11 | `getInitials`, `formatCurrency`, preference parsing and defaults |
| `apps/ml` | 2 | Package import and Python version pin consistency |

**55 tests total.** The dashboards are deliberately untested — every component renders
hardcoded mock data, so a test over them would assert that a constant equals itself. Add
component tests when those pages get real data.
- **CD** builds artifacts on `main`. All deploy steps are **placeholders** and stay skipped until the repo variable `ENABLE_CD=true` is set.

> ✅ **CI is green.** `lint`, `typecheck`, `test` and `build` all pass. The production
> build failure previously recorded here (`InvariantError: Expected workStore to be
> initialized` while prerendering `/dashboard/account-settings`) was caused by
> `lucide-react` v1, which calls `createContext` at module scope without a `"use client"`
> directive and so breaks any React Server Component importing an icon. The dependency is
> pinned to `0.577.0`.

CI runs **one job per workspace**, so a failure in one member's area never hides another's.
Each job reports lint, typecheck, test and build separately, and every individual test is
listed on the run's summary page. Failing assertions are annotated inline on the pull
request diff.

Run the same checks locally before opening a PR:

```bash
npm run ci        # Node workspaces
npm run ci:ml     # Python (needs Python 3.12 + pip)
./scripts/ci-local.sh   # both
```

See [`docs/ci-cd.md`](docs/ci-cd.md).

---

## Git workflow

Never commit directly to `main` or `dev`. One task = one branch = one PR into `dev`.

```bash
git checkout dev && git pull origin dev
git checkout -b feature/sXX-tXXX-short-name-yourname
```

Full rules, commit format, and branch naming in [`docs/gitworkflow.md`](docs/gitworkflow.md).

---

## Team

| Member | Roll No | Area |
|---|---|---|
| Amina Batool | 2023-CS-624 | Frontend dashboard, seller screens, copilot UI, approval UI, analytics pages |
| Monis Hussain | 2023-CS-639 | Backend APIs, database design, auth, sync logs, store connectors |
| Talha Rana | 2023-CS-605 | WhatsApp AI agent, LangGraph workflow, Twilio webhooks, conversation memory, human handoff |
| Faizan | 2023-CS-622 | RAG pipeline, COD/risk model (Random Forest), data preprocessing, courier decision engine |

Supervisor: Ma'am Anam Iftikhar
