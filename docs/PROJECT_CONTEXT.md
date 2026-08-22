# PROJECT_CONTEXT.md

> High-level project context for AI coding assistants and new team members working on **PakCommerce AI**.
>
> This document covers **business context, product vision, domain knowledge, architectural principles, and current implementation status**.
>
> Whenever implementing a feature, prioritize the principles in this document over assumptions.

---

## ⚠️ How to read this document

This project has two layers, and confusing them causes real bugs:

| Layer | Source | Status |
|---|---|---|
| **The target system** | The product vision sections below | **Planned.** Mostly not built. |
| **The current codebase** | This repository | **Phase 3 of 8.** See [Implementation Status](#implementation-status). |

Sections describing vision, domain, philosophy, and invariants describe **where the project is going**. They are binding as *principles* — follow them when writing new code — but they do **not** describe what exists today.

Before writing code that depends on a feature, check [Implementation Status](#implementation-status). When in doubt, assume it does not exist.

**Last verified against the codebase: 2026-08-17** — including a full `lint` / `typecheck` / `test` / `build` run, not a reading.

---

# Project Overview

PakCommerce AI is an AI-powered ecommerce operations platform built specifically for Pakistani online sellers.

The platform connects existing ecommerce systems into one centralized workspace where sellers can manage products, inventory, orders, customers, conversations, courier information, and business insights.

PakCommerce AI is **not** another ecommerce platform or marketplace. Instead, it acts as an intelligent operational layer that sits above existing ecommerce systems and enhances them using AI.

---

# Vision

The vision of PakCommerce AI is to simplify ecommerce operations for Pakistani businesses by combining centralized business management with practical AI assistance.

Instead of switching between multiple dashboards every day, sellers should be able to manage their business from one place while AI assists both customers and sellers.

---

# Product Philosophy

PakCommerce AI is built around several fundamental ideas.

- AI should assist people, not replace them.
- The seller always remains in control.
- AI should work from real business data rather than assumptions.
- Recommendations should be explainable.
- Business operations should be transparent and auditable.
- Integrations should be modular and replaceable.
- The platform should be easy to extend without major redesign.

---

# Target Users

The primary users are Pakistani ecommerce sellers who operate one or more online stores.

Typical sellers may use:

- Shopify
- WooCommerce
- WhatsApp
- Facebook
- Instagram
- Local courier companies

Most sellers currently perform many repetitive tasks manually across multiple platforms.

PakCommerce AI aims to centralize these workflows.

---

# Problems Being Solved

PakCommerce AI exists to reduce common operational challenges faced by ecommerce sellers.

Examples include:

- fragmented business tools
- inventory inconsistencies
- duplicate manual work
- slow customer communication
- poor business visibility
- difficult order management
- inefficient courier selection
- lack of actionable business insights

The goal is to improve operational efficiency rather than replace existing ecommerce platforms.

---

# Core Domain

The platform revolves around the following business entities.

The **Built?** column reflects the actual database schema and code today.

| Entity | Description | Built? |
|---|---|---|
| **Seller** | Owner of a workspace. Each seller has completely isolated business data. | ✅ `seller_profiles`, `profiles` |
| **Workspace** | The isolated environment where a seller manages their business. Everything belongs to a workspace. | ✅ `workspaces` table + Zod contract |
| **Store** | A connected ecommerce platform belonging to a seller. A seller may connect multiple stores. | ❌ Not modelled |
| **Product** | An item sold by the seller. Products may exist across multiple connected stores. | ✅ `products` table + Zod contract (T-020) |
| **Inventory** | The centralized stock state managed by PakCommerce AI. Connected stores synchronize with this central inventory. | 🟡 Per-variant stock on `product_variants`; `inventory_state` is a generated column. No sync engine yet |
| **Order** | A purchase created by customers or synchronized from connected stores. | ❌ Not modelled |
| **Customer** | A buyer with order history and conversation history. | ❌ Not modelled |
| **Conversation** | Communication between customers and sellers. May contain AI interactions. | ❌ Not modelled |
| **Courier** | A delivery provider connected by the seller. | ❌ Not modelled |
| **AI Session** | An interaction between a customer or seller and one of the AI systems. | ❌ Not modelled |
| **Insight** | A business observation generated from structured business data. | ❌ Not modelled |
| **Audit Event** | A recorded system action for transparency and traceability. | ❌ Not modelled |

---

# AI Experiences

PakCommerce AI contains two primary AI systems. They serve different users but operate on the same centralized business platform.

> 🔴 **Neither is implemented.** No AI SDK, LLM provider, agent framework, or vector store is installed. The dashboard pages named "AI Sales Agent" and "AI Insights and Copilot" are **static mock UI**.

---

## Buyer-Facing AI (WhatsApp Sales Agent)

The Buyer-Facing AI is the **WhatsApp Sales Agent**. It communicates directly with customers on behalf of the seller.

Its responsibilities include:

- answering customer questions
- helping customers find products
- checking availability
- assisting product selection
- collecting order information
- creating draft orders
- answering store-related questions
- handing conversations to humans when required

The WhatsApp Sales Agent represents the seller but never replaces them. It should always rely on real business data and avoid inventing information.

**Planned runtime:** LangGraph, chosen for stateful workflow management, conversation memory, and built-in human handoff. Inbound messages arrive via a Twilio webhook. **Sellers own their own Twilio account, number, and billing** — the platform connects to it and never resells numbers.

---

## Seller-Facing AI (Business Copilot)

The Seller-Facing AI is the **Business Copilot** available inside the seller dashboard.

Its responsibilities include:

- answering business questions
- explaining business performance
- summarizing operational data
- assisting with platform workflows
- recommending improvements
- helping sellers understand their business

The Business Copilot is an intelligent assistant, not an autonomous business manager.

**Planned runtime:** Vercel AI SDK, chosen for low-latency streaming responses in the dashboard.

---

# Implementation Status

**As of 2026-08-17.** Update this section whenever a slice lands.

## Proposal phase tracking

The proposal defines a 20-week, 8-phase plan. Current position: **end of Phase 3**.

| Phase | Weeks | Scope | Status |
|---|---|---|---|
| 1 | 1–2 | Requirements, competitor study, scope | ✅ Done (proposal submitted) |
| 2 | 3–4 | Architecture, ERD, UI wireframes, API feasibility | 🟡 Partial — no ERD in repo |
| 3 | 5–7 | Backend setup, database, auth, dashboard base | 🟡 Mostly done — auth logic missing |
| 4 | 8–10 | Shopify/WooCommerce connectors, product/order/inventory sync, selective SKU rules | ❌ Not started |
| 5 | 11–13 | WhatsApp AI agent, Twilio webhooks, conversation memory, draft orders, begin ML training | ❌ Not started |
| 6 | 14–15 | Seller copilot, RAG pipeline, tool calls, approval system, finalize COD model | ❌ Not started |
| 7 | 16–17 | COD/risk scoring integration, AI insights, courier selection engine, audit logs | ❌ Not started |
| 8 | 18–20 | Testing, bug fixing, final report, presentation, live demo | ❌ Not started |

## What exists in code

**`apps/web` — Next.js 16 App Router, port 3000**

- 6 dashboard pages: sales-and-orders, inventory-management, ai-insights-and-copilot, ai-sales-agent, logistics-and-courier, account-settings
- Every page renders **hardcoded mock data**. No page fetches from a database or API.
- Sidebar, theme switching, layout preferences, and cookie-backed preference storage all work
- Login and register pages exist but are **UI only** — `login-form.tsx` submits to a `toast()`, not to Supabase
- `proxy.ts` (Next 16's renamed middleware) refreshes Supabase SSR cookies
- **The web app never calls the API on port 4000.** Zero references to `API_URL`, `localhost:4000`, or `/api/v1`.

**`apps/api` — Express 5, port 4000**

- One router (`healthRouter`), mounted at both `/health` and `/api/v1`
- `src/app.ts` exports `createApp()`; `src/index.ts` loads env and binds the port. Split so the app can be driven in-process by tests
- CORS restricted to `APP_URL`, JSON body parsing enabled
- `src/lib/supabase.ts` exports client factories that **nothing imports yet**
- No business endpoints, no auth middleware, no webhook handlers

**`apps/ml` — not scaffolded**

- `pyproject.toml` (ruff + pytest config), `.python-version` (3.12), one placeholder test
- `requirements.txt` has FastAPI and uvicorn **commented out**
- No model, no training pipeline, no dataset

**`packages/shared`**

- Well-developed Zod contracts for products (variants, images, options, inventory state, search queries) and workspaces, versioned `2026-07-12`
- Covered by 24 tests as of 2026-08-17. Those tests found — and the fix removed — a crash that made the package unimportable
- 🔴 **Still orphaned** — neither `apps/web` nor `apps/api` declares it as a dependency, and nothing imports it. Under the API-centric answer to Open Decision #1 (2026-08-22), shared becomes load-bearing: Express validates request bodies against these schemas, and web types its fetch responses with them. Treat "shared is imported by ≥1 app" as an exit criterion for Phase 4.

**`packages/integrations`**

- Supabase client + admin client factories, env config resolution, generated `database.types.ts`
- Only Supabase. No Shopify, WooCommerce, Twilio, or courier adapters.

**`packages/ai`**

- Empty. Placeholder npm scripts only.

## Database schema

Five tables: `profiles`, `seller_profiles`, `workspaces`, `products`, `product_variants`.
Five enums: `seller_verification_status`, `workspace_status`, `product_status`,
`product_variant_status`, `inventory_state`.

✅ **`supabase/migrations/` now exists** and `supabase db reset` rebuilds the whole schema
from source. Migrations are append-only: a mistake in a shipped migration is corrected by a
new one, never by editing the old one.

RLS is enabled on `products` and `product_variants` — the first tables in the project to
enforce tenant isolation rather than assume it.

## Known defects

| Issue | Location | Impact |
|---|---|---|
| `@shadcn/react` dependency never imported | `apps/web/package.json` | Dead dependency |
| CD uploads `apps/web/dist` | `.github/workflows/cd.yml` | Next.js builds to `.next` — artifact is always empty |
| 8 npm advisories (1 moderate, 7 high) | root `package-lock.json` | Untriaged dependency vulnerabilities. Needs audit triage before enabling audit gate. |
| No branch protection on `dev` / `main` | GitHub repository settings | CI is advisory; a red branch can still be merged |
| `workspaces` grants `ALL` to `anon` | `supabase/migrations/20260818100001_...sql`, privileges section | Pre-existing, inherited from the hosted schema. Not a leak — RLS returns zero rows for `anon` — but `profiles` and `seller_profiles` stop `anon` at *both* the privilege layer and RLS, while `workspaces` relies on RLS alone. `ALL` also includes `TRUNCATE`, which RLS does not filter. **Fix:** `revoke all on public.workspaces from anon` in a follow-up migration |
| `seller_profiles.verification_status` is writable by the seller via RLS | `20260818100001_...sql` | A policy applies per row, so it cannot stop a seller editing one column of *their own* row. Column-level grants already restrict `UPDATE` to display fields, so this is defence-in-depth rather than a live hole. Revisit when the verification feature is built |
| Five migrations applied to production were never committed | `supabase/migrations/*_history_placeholder.sql` | Versions `20260711085757`–`20260712162600` built the identity tables; their SQL is not in git. Placeholders keep local and remote histories aligned. **If anyone finds the originals, prefer them** — they carry the intent, not just the result |

### Resolved since the last revision

| Was reported | Reality |
|---|---|
| 🔴 `npm run build` fails prerendering `/dashboard/account-settings` | **Fixed.** Caused by `lucide-react` v1 calling `createContext` at module scope without `"use client"`, which breaks any RSC importing an icon. Pinned to `0.577.0`; full build passes. |
| `.env` path breaks in the production build | **Was never true.** `apps/api/src` and `apps/api/dist` sit at the same depth, so `../../../.env` resolves to the repo root from both. |
| `ci-cd.md` says Node 20 and `vite build` | **Corrected.** |
| 🔴 `packages/shared` — *(undetected)* | **Found by the new test suite.** The package threw `.pick() cannot be used on object schemas containing refinements` at import time. Invisible to `tsc` and unnoticed because nothing imports the package. Fixed by deriving list-item schemas from an unrefined base. |

---

# Architecture As Built

```text
┌──────────────────────┐         ┌──────────────────────┐
│  apps/web  :3000     │         │  apps/api  :4000     │
│  Next.js 16          │   ✗     │  Express 5           │
│  6 mock dashboards   │ ─ ─ ─ ─ │  /health only        │
│  auth UI (inert)     │  no      │                     │
└──────────┬───────────┘  calls  └──────────┬───────────┘
           │                                │
           └──────────────┬─────────────────┘
                          ▼
              packages/integrations
              (Supabase client factories)
                          │
                          ▼
                 Supabase PostgreSQL
        profiles · seller_profiles · workspaces
```

The dashed line is the important part: **the two apps are not connected**. Both reach Supabase independently, and the API is not on the dashboard's data path.

Target architecture from the proposal — for reference, not yet real:

```text
Customer (WhatsApp) → Seller-owned Twilio → Node/Express backend (auth, webhooks, API)
                                                     │
                            ┌────────────────────────┼────────────────────────┐
                            ▼                        ▼                        ▼
                  Shared Tool Registry        Supabase Postgres        FastAPI ML service
              (products, inventory, orders,   (+ pgvector for RAG)    (COD risk, courier score)
                    couriers, WhatsApp)
                            │
                            ▼
                   Seller Dashboard + Copilot UI (Vercel AI SDK)
```

---

# Open Decisions

Unresolved questions that block or shape upcoming work. **Record the answer here once decided** — these determine architecture, and guessing wrong is expensive.

| # | Decision | Why it matters |
|---|---|---|
| 1 | ~~**Where does business logic live**~~ **ANSWERED (2026-08-22, revised same day): API-centric.** All business data access lives behind `apps/api` REST endpoints (`/api/v1/...`). `apps/web` fetches from Express and never queries Supabase tables directly — enforced by an executable guard (`apps/web/src/architecture.test.ts`, fails CI on `.from()`/`.rpc()`/service-role usage in web source). Express also owns webhooks, the AI copilot/agent, background jobs, and is the only place the service-role key may appear. Auth forwarding middleware (web sends Supabase session JWT → Express validates → user-scoped client) is a prerequisite for all endpoints. RLS stays as defense in depth. | Team familiarity, testability via supertest/Postman for grading, single chokepoint for data access, and it makes `packages/shared` the load-bearing DTO/validation contract for both sides. Chosen over hybrid deliberately after weighing tradeoffs — see git history for the earlier hybrid rationale. |
| 2 | **Where does LangGraph run** — LangGraph.js in `packages/ai`, Python LangGraph in `apps/ml`, or a separate service? | `packages/ai` is a Node package; LangGraph is Python-first. Decides the language boundary of the agent. |
| 3 | ~~**Supabase Auth or custom JWT?**~~ **ANSWERED (2026-08-22): Supabase Auth only.** RLS policies depend on `auth.uid()` and `@supabase/ssr` cookie sessions are already wired in `apps/web`. Cleanup: remove `JWT_SECRET`/`DATABASE_URL` from `.env.example` once no code references them. | Custom JWTs would require rewriting every RLS policy. |
| 4 | ~~**How is tenant isolation enforced**~~ **ANSWERED (T-020): Postgres RLS.** Policies ship in the same migration as the table. `createApiSupabaseAdminClient()` is the exception, for trusted server code only. | Set by `supabase/migrations/20260818100007_product_catalog_rls.sql`. Every new table follows it. |
| 5 | ~~**Who owns migrations, and where do they live?**~~ **ANSWERED (T-020): `supabase/migrations/`,** Supabase CLI, append-only, one file per responsibility. | Schema is reproducible with `supabase db reset`. The baseline of the three original tables was **captured** from the live project with `supabase db dump --linked`, then verified by diffing both databases — identical. |
| 6 | **Currency** — `moneySchema` hard-codes `PKR`. What happens to a USD-denominated Shopify store? | **Partly answered (T-020):** storage keeps an explicit `price_currency` column with an ISO-shape check, so the schema does not need a migration to widen. The application contract is still PKR-only — that part is still open. |
| 7 | **Seller credential storage** — encrypted at rest, Supabase Vault, or plain columns behind RLS? | Sellers hand over per-seller credentials for **multiple carriers and stores** (confirmed 2026-08-22): each seller may connect Shopify/WooCommerce plus several couriers (PostEx/TCS/BlueEx), so the credential store must be keyed by `(seller, provider)` and support many providers per seller. Storage mechanism itself still undecided. |
| 8 | ~~**Courier API access**~~ **ANSWERED (2026-08-22):** No carrier credentials in hand today. Real credentials will arrive **per seller, later** — sellers supply their own courier accounts, possibly across different carriers. Consequence: Phase 7 starts on synthetic data; the courier adapter layer (Integration Philosophy) must accept per-tenant credentials, not project-level ones. Blocks nothing until Phase 7 planning. | Shapes the adapter interface and ties into Decision #7 storage design. |

---

# Integration Philosophy

PakCommerce AI is integration-first.

External systems remain the source of ecommerce operations while PakCommerce AI coordinates and enhances those workflows.

The architecture should never assume only one provider exists.

New integrations should be easy to introduce without redesigning the system.

The AI model provider must stay replaceable — OpenAI, Gemini, Claude, or another provider behind an abstraction layer. WhatsApp, store, and courier services connect through adapters for the same reason.

---

# Multi-Tenant Architecture

PakCommerce AI is a multi-tenant platform.

Every seller owns independent:

- stores
- products
- inventory
- customers
- conversations
- orders
- analytics
- AI history
- business settings

Tenant isolation must always be preserved.

> **Enforced on every table that exists.** `products` and `product_variants` carry RLS
> policies plus a composite foreign key that makes `workspace_id`/`seller_id` drift
> impossible. `profiles`, `seller_profiles` and `workspaces` already carried RLS and eight
> policies on the hosted project; the repository did not know until the live schema was
> dumped. They are now captured in the baseline migration, so a local database enforces the
> same rules.
>
> 20 tests prove the boundary by attacking it: what seller A can actually do to seller B's
> rows, not what the policies claim.
>
> Hard-deleting a workspace is deliberately denied to clients. It cascades to the entire
> catalogue, and the contract already models retirement as `status = 'archived'` — reversible
> and auditable, which a delete is not.

---

# AI Philosophy

AI is an assistant built on top of structured business systems.

Whenever possible, AI should:

- retrieve current business data
- use backend tools
- explain conclusions
- avoid guessing
- avoid hallucinating
- remain grounded in business facts

LLMs should interpret data rather than generate business facts.

---

# Explainability

Whenever the system produces:

- recommendations
- scores
- insights
- summaries
- decisions

the seller should be able to understand **why**.

Explainability is a product feature, not an optional enhancement. This is why the COD risk model is a Random Forest (with SHAP / feature importance scores) rather than an unexplainable black-box model.

---

# Machine Learning & Logistics Risk Methodology

The predictive ML components in `apps/ml` (COD Risk Prediction and Courier Routing) operate under strict methodological constraints:

### 1. Decision-Theoretic Economics (PKR Cost-Benefit Thresholding)
Model metrics are evaluated against real business economics rather than raw accuracy alone:
* **Cost of False Positive (FP):** An un-risky order is flagged as high-risk $\rightarrow$ Triggers an automated WhatsApp verification message $\rightarrow$ Cost: **~Rs. 3 in API fee** + minor customer friction.
* **Cost of False Negative (FN):** A risky order is missed $\rightarrow$ Shipped blindly $\rightarrow$ Rejected at customer doorstep $\rightarrow$ Cost: **~Rs. 250 to 400 return shipping loss** + inventory locked in transit for 7 to 10 days.
* **Decision Rule:** Because a False Negative is ~100x more expensive than a False Positive, the classification probability threshold is calibrated at $p > 0.35$ (minimizing expected monetary loss) rather than an arbitrary $0.50$ default.

### 2. Realistic Performance Expectations
* Customer doorstep rejection contains real behavioral noise. A realistic, legitimate production AUC-ROC target for this tabular problem is **0.62 to 0.70**.
* The goal is not unrealistic 95% accuracy, but providing a statistically significant risk ranking that saves merchants thousands of rupees in preventable return fees.

### 3. Core Feature Set
1. **Product Category / Vertical:** Footwear, unstitched apparel, electronics, cosmetics (product category is a primary driver of sizing and impulse cancellation risk).
2. **Destination City & City Tier:** Tier 1 (Karachi, Lahore, Islamabad/Rawalpindi) vs Tier 2 vs Tier 3 / remote tehsils.
3. **Courier Performance Matrix:** Historical route delivery success rates for Trax, PostEx, Leopards, and TCS per city.
4. **Order Value in PKR:** Low-ticket (< Rs. 1,500) vs high-ticket (> Rs. 5,000 liquid cash hesitation).
5. **Address Quality Score:** Text length and presence of recognizable landmark/house heuristics.
6. **Customer Relationship:** First-time buyer vs repeat customer with past successful deliveries.
7. **Channel of Origin:** Web store checkout vs unverified social media direct message.

### 4. Validation Strategy (Merchant-Holdout & Time-Split)
To ensure the model learns generalizable logistics and consumer behavior rather than memorizing a single store's quirks:
* **Merchant-Holdout Cross-Validation:** The model is trained on Merchants A and B, and evaluated on unseen Merchant C.
* **Time-Based Splitting:** Training on historical orders and testing strictly on subsequent chronological timeframes to prevent data leakage.
* **Synthetic & Kaggle Data Role:** Synthetic generators and public datasets serve as pipeline scaffolding and baseline smoke tests; final evaluation is validated on holdout merchant test sets.

### 5. Cross-Merchant Pool Security & Framing
* Standalone SHA-256 hashing of phone numbers has low entropy (~50M Pakistani mobile numbers) and does not constitute full zero-knowledge privacy against brute-force attacks.
* The system frames cross-store intelligence as **pseudonymous matching via a server-held HMAC broker key** or centralized aggregate reputation scores (`buyer_network_metrics`), ensuring tenant data is isolated while preserving shared risk signals.

### 6. Decision Support vs. Blind Automation
* Courier routing and risk warnings operate as **decision support with confidence intervals**.
* The platform recommends optimal couriers and suggests verification actions, maintaining seller override authority at all times.

---

# Human-in-the-Loop

AI should never silently perform sensitive business operations.

Whenever confidence is low or an action has business impact, the seller should have the opportunity to review or approve it.

The seller always has final authority.

---

# Auditability

Important actions should be traceable.

The platform should make it possible to understand:

- what happened
- when it happened
- who initiated it
- whether AI was involved

Transparency is preferred over hidden automation.

---

# Scalability

The system should be designed so that future expansion is straightforward.

Possible future additions include:

- new ecommerce platforms
- additional courier providers
- more communication channels
- additional AI capabilities
- richer analytics
- workflow automation
- business integrations

The architecture should encourage extension instead of duplication.

---

# Development Principles

When implementing new functionality:

- Keep modules loosely coupled.
- Prefer reusable services.
- Keep business logic independent from UI.
- Keep integrations independent from business logic.
- Avoid hardcoding provider-specific assumptions.
- Design for maintainability.
- Design for extensibility.
- Prefer composition over duplication.

Practical rules for this repository:

- Domain types and validation belong in `packages/shared` — define them once, import them in both apps.
- External providers belong in `packages/integrations`, never inline in a route handler or component.
- Do not add a second source of truth for an entity that already has a Zod contract.

---

# Things That Must Always Be True

These are project invariants.

- Every resource belongs to exactly one seller.
- AI never invents business data.
- AI recommendations should be explainable.
- Inventory has one source of truth.
- Connected systems synchronize with the central platform.
- Sensitive actions require seller approval.
- AI should use tools whenever fresh business data is required.
- External providers are integrations, not business logic.
- Every integration should be replaceable.
- Important AI actions should be auditable.
- Business calculations belong in backend services rather than LLM prompts.
- AI should enhance seller productivity rather than remove seller control.

---

# How AI Should Think

Before implementing any feature, consider the following questions.

1. Which seller owns this?
2. Does this affect inventory?
3. Should this action be logged?
4. Should this require seller approval?
5. Does the AI need fresh business data?
6. Is this business logic or integration logic?
7. Can another provider replace this implementation later?
8. Will this scale to many sellers?
9. Does this preserve tenant isolation?
10. Does this make the platform easier to extend?

And, specific to this codebase's current state:

11. Does this feature actually exist yet, or am I assuming it from the proposal?
12. Does this belong in `apps/web`, `apps/api`, or `packages/*`? (See Open Decision #1.)

---

# Out of Scope

PakCommerce AI is **not**:

- an ecommerce marketplace
- an online shopping website
- a courier company
- a payment gateway
- an ERP replacement
- a chatbot demonstration
- a Shopify replacement
- a WooCommerce replacement
- a standalone AI application

It complements existing ecommerce ecosystems instead of replacing them.

---

# Overall Goal

PakCommerce AI combines two complementary AI experiences:

- **Buyer-Facing AI:** a WhatsApp Sales Agent that assists customers throughout the buying journey.
- **Seller-Facing AI:** a Business Copilot that helps sellers operate and understand their ecommerce business.

Both AI systems operate on top of the same centralized business platform, ensuring they always work with the same products, inventory, customers, orders, conversations, and business data.

Every feature added to the project should support one overarching objective:

> Help Pakistani ecommerce sellers operate their businesses more efficiently through centralized operations, practical AI assistance, explainable automation, and seamless integration with their existing ecommerce ecosystem.

---

# Related Documents

| Document | Purpose |
|---|---|
| [`RUNBOOK.md`](RUNBOOK.md) | Install, run, verify, troubleshoot |
| [`supabase-setup.md`](supabase-setup.md) | Supabase env vars and client usage |
| [`ci-cd.md`](ci-cd.md) | CI/CD pipelines |
| [`gitworkflow.md`](gitworkflow.md) | Branching, commits, PR rules |
| [`../README.md`](../README.md) | Repository entry point and status table |
