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
| **This codebase** | Phase 3 is done. The catalogue API and seller copilot are in. Store sync, WhatsApp, RAG, and the COD model are not. |
| **Built so far** | Supabase Auth, workspace/product/inventory/order/customer schema, product CRUD, inventory adjustments, draft/manual orders, confirm-with-stock deduction, a streaming Business Copilot with guarded writes, and the dashboard shell. |
| **Not started** | Store connectors, sync engine, WhatsApp agent, RAG, ML/COD risk model, real courier scoring, ship/return flows, audit logs. |

When a document describes a feature, check the status table below before assuming it exists.

**To run the project → [`docs/RUNBOOK.md`](docs/RUNBOOK.md)**

---

## Status by workspace

| Workspace | Package | State | What is actually there |
|---|---|---|---|
| `apps/web` | `@pakcommerce/web` | 🟡 **Partial** | Next.js 16 App Router. Login and register use Supabase Auth. The copilot, products, and orders (list, detail with confirm/cancel, and a manual order form with product picker) pages call the API. Orders overview widgets, inventory, logistics, conversations, approvals, and analytics still render **mock data**. Customers is an empty placeholder. |
| `apps/api` | `@pakcommerce/api` | 🟡 **Partial** | Express 5. Product CRUD, inventory adjustments, orders (draft + confirm/cancel), customers (list, profile, notes), and streaming copilot chat — all behind bearer-token auth. Seller scoping is enforced by RLS. See [`docs/api.md`](docs/api.md). |
| `apps/ml` | `@pakcommerce/ml` | ⚪ **Not scaffolded** | Config only (ruff, pytest, Python pin). No FastAPI app, no model. Runtime deps are commented out. |
| `packages/shared` | `@pakcommerce/shared` | 🟢 **In use** | Zod contracts for products, workspaces, inventory, orders, customers, categories, and API envelopes. `apps/api` validates requests with them. `apps/web` uses the error envelope in its API client. |
| `packages/integrations` | `@pakcommerce/integrations` | 🟢 **Working** | Supabase client/admin factories + generated DB types. Used by both web and api. |
| `packages/ai` | `@pakcommerce/ai` | ⚪ **Empty stub** | Placeholder scripts only. |

### Database

Fourteen tables: `profiles`, `seller_profiles`, `workspaces`, `products`, `product_variants`,
`product_images`, `categories`, `copilot_chats`, `stock_movements`, `orders`,
`order_items`, `order_status_history`, `customers`, `customer_notes`.
Ten enums: `seller_verification_status`, `workspace_status`, `product_status`,
`product_variant_status`, `inventory_state`, `stock_movement_reason`, `order_status`,
`order_channel`, `order_payment_method`, `customer_note_kind`.
Three views: `product_list_view`, `inventory`, `customer_summary`.

Stock lives on `product_variants` (on hand, reserved, threshold). `inventory` is a read-only
view over it, and `stock_movements` is the append-only history of every change.
`POST /api/v1/inventory/adjustments` changes stock and records the movement in one
transaction through the `adjust_stock` function. The copilot's stock tool goes through it
too. The product API does not yet, so stock set on product create or update still has no movement.

Draft/manual orders land through `POST /api/v1/orders`; confirmation deducts stock via
`POST /api/v1/orders/:id/transition` (`transition_order_status` + `sale` movements).
Every order is linked to a customer by a database trigger, keyed on the normalised phone
(`normalize_phone`), and `customer_summary` computes lifetime spend and order counts from
orders. Ship/return, conversations, and couriers **do not exist yet**.

✅ The schema is reproducible from source. `supabase/migrations/` holds every change and
`npx supabase db reset` rebuilds the whole database on an empty Postgres. Migrations are
append-only — see [`docs/supabase-setup.md`](docs/supabase-setup.md#migrations).

Every table carries RLS policies, so tenant isolation is enforced by the database rather than
by remembering a `where` clause on each query.

---

## Repository structure

```text
├── apps/
│   ├── web/                    # Next.js 16 seller dashboard (port 3000)
│   ├── api/                    # Express 5 backend (port 4000)
│   └── ml/                     # Python FastAPI ML service (not scaffolded)
├── packages/
│   ├── shared/                 # Zod domain contracts (products, workspaces, inventory, orders, customers, categories)
│   ├── integrations/           # Supabase clients + generated DB types
│   └── ai/                     # AI/agent code (empty)
├── supabase/
│   ├── config.toml             # Supabase CLI config
│   └── migrations/             # Schema, append-only — the source of truth
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
| UI behaviors | [UI SDK](https://github.com/vercel-labs/ui) (`@ui-sdk/core`, `@ui-sdk/react`) — accessible popup, selection, focus and typeahead behaviors for building new components. **Beta**, pinned to `0.1.0-beta.1`; upgrade deliberately |
| Backend | Node 22, Express 5.2.1, `tsx` for dev |
| Database / Auth | Supabase (PostgreSQL), `@supabase/ssr` |
| Validation | Zod 4 |
| ML | Python 3.12, ruff, pytest — *scikit-learn / FastAPI not yet added* |
| Monorepo | npm workspaces (no Turborepo/Nx) |

Installed for the seller copilot: Vercel AI SDK, with Google, DeepSeek, OpenRouter, and Ollama providers. The chat falls back to a setup message when no provider key is set.

Planned but **not yet installed**: LangGraph, Twilio, scikit-learn, pgvector, Redis/BullMQ, courier SDKs.

---

## Quick start

Full instructions, prerequisites, environment variables, and troubleshooting are in **[`docs/RUNBOOK.md`](docs/RUNBOOK.md)**.

```bash
npm install
npm run dev
```

- Web → <http://localhost:3000>
- API → <http://localhost:4000/health>

> The root `npm run dev` script runs both web and api concurrently. You can also run each workspace separately with `npm run dev:web` or `npm run dev:api`. See the runbook.

---

## CI/CD

- **CI** runs on **every pull request** into `dev` or `main`, and on direct pushes to those branches: secret scan → install → lint → typecheck → test → build per workspace, a Python job (ruff + pytest) for `apps/ml`, and a database job that replays the migrations and runs the integration tests. Working on a branch with no PR yet? Run `npm run ci` locally, or trigger CI from the Actions tab.

### Test suite

| Workspace | Unit tests | Covers |
|---|---|---|
| `packages/shared` | 118 | Product, workspace, inventory, order, category, and API-envelope Zod contracts — money in PKR minor units, single-primary-image, variant/option limits, archive invariant, search defaults, order state machine, money and quantity caps |
| `packages/integrations` | 16 | Supabase env resolution, the `SUPABASE_ANON_KEY` fallback, service-role handling, client factory options |
| `apps/api` | 153 | Auth middleware, health, product/order mapping, and copilot tools (SQL preflight, schema document, provider selection, guarded mutations, draft-only `createDraftOrder`) |
| `apps/web` | 38 | `getInitials`, `formatCurrency`, preference parsing, order confirm/cancel gating, manual order form logic (cart, rupee conversion, quantity parsing, estimate, address-required validation, error mapping), and the API-centric architecture guard |
| `apps/ml` | 2 | Package import and Python version pin consistency |

**325 Node unit tests** run under `npm run test`. The 2 Python tests run under `npm run ci:ml`.

**257 database tests** need Postgres. Run them with `npx supabase start` then `npm run test:integration`. They stay out of `npm run test` so the unit suite runs without Docker.

| Suite | Tests | Covers |
|---|---|---|
| `packages/integrations` schema conformance | 19 | Columns match the contract, enums match Zod, constraints reject bad data, `inventory_state` computes correctly |
| `packages/integrations` catalogue isolation | 8 | A seller cannot read, insert, reassign, or delete another seller's products or variants |
| `packages/integrations` inventory conformance | 22 | Movement and inventory columns match the contract, reasons match Zod, movements must add up and cannot be edited, state follows available stock, a workspace can still be removed |
| `packages/integrations` stock adjustment | 14 | `adjust_stock` writes quantity and movement together, refuses negative, below-reserved, unchanged and untracked, and cannot touch another seller's variant |
| `packages/integrations` inventory isolation | 10 | A seller cannot read another's movements or inventory, record one in someone else's name, or edit or delete their own |
| `packages/integrations` copilot chat isolation | 7 | A seller cannot read or change another seller's chats |
| `packages/integrations` identity isolation | 14 | A seller cannot read another's profile, business details, or workspaces; workspaces cannot be reassigned or hard-deleted |
| `packages/integrations` order schema | 17 | Order, item and history columns match the contract, enums match Zod, totals/address/`confirmed_at` checks, illegal transitions and raw status updates refused, history is append-only |
| `packages/integrations` order isolation | 14 | A seller cannot read, insert, change or delete another seller's orders, items or history; anonymous users read nothing |
| `packages/integrations` order lifecycle | 9 | Status only changes through the lifecycle gate; cancel is atomic; confirm deducts stock with a sale movement and refuses short stock; lines freeze after leaving draft |
| `packages/integrations` copilot SQL guards | 15 | The read-only query tool cannot write (even through a function call); neither SQL tool can reach `set_config` — directly, through functions that run SQL from a string (`query_to_xml`, `ts_stat`), through each other, or with escapes — so they cannot fake the seller's identity or open the order lifecycle gate; `mutateDatabase` cannot write orders, order lines, order history or stock movements, or change stock; plain selects, updates and price changes still work |
| `apps/api` product API | 24 | Product CRUD against a real database, with RLS scoping |
| `apps/api` inventory API | 23 | Stock adjustments and movement history against a real database: every refusal, nothing written on refusal, filters, paging, isolation |
| `apps/api` orders API | 46 | Draft create (every field, price snapshot, 400 field paths), list/get, order detail with stock checks, cancel, refused transitions, confirm with stock deduction (summed lines, reserved stock, untracked), failed stock (atomic across lines, missing address, competing drafts), and agreement between the detail warning and confirm, against a real database with RLS isolation |
| `apps/api` copilot tools | 15 | Read and guarded-write tools against a real database, including `createDraftOrder` (draft only, server-side prices, stock untouched, other sellers refused) |

**584 tests total** (325 Node unit + 2 Python + 257 database). Mock dashboard components are deliberately untested — a render test would assert that a constant equals itself. The copilot, products and orders pages call the API and have no component tests yet. Add component tests when a page reads real data.

- **CD** builds artifacts on `main`. Web deploys run through Netlify's Git integration and the API through a Render Blueprint (`render.yaml`) after CI checks pass. See [`docs/ci-cd.md`](docs/ci-cd.md).

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
