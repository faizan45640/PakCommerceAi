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
| **Product** | An item sold by the seller. Products may exist across multiple connected stores. | 🟡 Zod contract only — **no table** |
| **Inventory** | The centralized stock state managed by PakCommerce AI. Connected stores synchronize with this central inventory. | 🟡 Embedded in the product contract — **no table** |
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
- 🔴 **Still orphaned** — neither `apps/web` nor `apps/api` declares it as a dependency, and nothing imports it. Open Decision #1 governs when that changes

**`packages/integrations`**

- Supabase client + admin client factories, env config resolution, generated `database.types.ts`
- Only Supabase. No Shopify, WooCommerce, Twilio, or courier adapters.

**`packages/ai`**

- Empty. Placeholder npm scripts only.

## Database schema

Three tables: `profiles`, `seller_profiles`, `workspaces`. Two enums: `seller_verification_status`, `workspace_status`.

🔴 **There is no `supabase/migrations/` directory.** The schema is not reproducible from source control.

## Known defects

| Issue | Location | Impact |
|---|---|---|
| `@shadcn/react` dependency never imported | `apps/web/package.json` | Dead dependency |
| CD uploads `apps/web/dist` | `.github/workflows/cd.yml` | Next.js builds to `.next` — artifact is always empty |
| 8 npm advisories (1 moderate, 7 high) | root `package-lock.json` | Untriaged dependency vulnerabilities. Needs audit triage before enabling audit gate. |
| No branch protection on `dev` / `main` | GitHub repository settings | CI is advisory; a red branch can still be merged. See BLK-1 |

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
| 1 | **Where does business logic live** — `apps/api` as the single backend, or Next.js server actions/route handlers for seller-facing reads with Express only for webhooks and AI? | Web currently bypasses the API entirely. Unresolved, this duplicates business logic across two runtimes. |
| 2 | **Where does LangGraph run** — LangGraph.js in `packages/ai`, Python LangGraph in `apps/ml`, or a separate service? | `packages/ai` is a Node package; LangGraph is Python-first. Decides the language boundary of the agent. |
| 3 | **Supabase Auth or custom JWT?** | `.env.example` carries both `JWT_SECRET`/`DATABASE_URL` and Supabase keys. Only one should survive. |
| 4 | **How is tenant isolation enforced** — Postgres RLS policies, or application-layer `workspace_id` filtering? | Determines whether `createApiSupabaseAdminClient()` (RLS-bypassing) is the norm or the exception. Tenant isolation is an invariant. |
| 5 | **Who owns migrations, and where do they live?** | Schema is currently not reproducible from the repo. |
| 6 | **Currency** — `moneySchema` hard-codes `PKR`. What happens to a USD-denominated Shopify store? | Fail, convert, or stay PKR-only — needs to be a decision, not an accident. |
| 7 | **Seller credential storage** — encrypted at rest, Supabase Vault, or plain columns behind RLS? | Sellers hand over Twilio API Key Secrets and Shopify tokens in Phase 4. |
| 8 | **Courier API access** — do we have PostEx/TCS/BlueEx credentials, or does courier scoring start on synthetic data? | Blocks Phase 7 planning. |

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

> ⚠️ **Not yet enforced anywhere.** `workspaces.seller_id` is a foreign key, but no RLS policy or application-layer guard exists in the repo. See Open Decision #4.

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

Explainability is a product feature, not an optional enhancement. This is why the COD risk model is a Random Forest — feature importance scores make the output explainable — rather than a black-box model.

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
