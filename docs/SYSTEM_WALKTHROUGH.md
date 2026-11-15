# PakCommerce AI — System Walkthrough

A guide for explaining the system to a supervisor or examiner: what each part does, how a request moves through the code, why it was built this way, and where to point when asked "show me".

Written against branch `dev` on 2026-11-15 (up to T-088). Paths are relative to the repo root.

---

## 1. The system in one picture

```text
                 Seller (browser)                       Buyer (WhatsApp)
                       │                                       │
                       ▼                                       ▼
         apps/web  (Next.js dashboard)            Meta Cloud API / Twilio / Simulator
          · login via Supabase Auth                            │  webhook (signed)
          · calls the API with the seller's JWT                │
                       │                                       │
                       ▼                                       ▼
         ┌──────────────────────── apps/api (Express) ────────────────────────┐
         │  REST API for the dashboard     WhatsApp webhooks + reply pipeline │
         │  Rafiq copilot (Vercel AI SDK)  Tool registry (one set of tools)   │
         └───────────────┬───────────────────────────────┬────────────────────┘
                         │ SQL (RLS or service role)     │ HTTP + service token
                         ▼                               ▼
              Supabase Postgres                 apps/ml (FastAPI + LangGraph)
          RLS · triggers · SQL functions        WhatsApp Sales Agent "brain"
          migrations in supabase/migrations     calls DeepSeek (or Gemini, ...)
```

| Part | Tech | Job | Deployed on |
|---|---|---|---|
| `apps/web` | Next.js 16, shadcn/ui, Tailwind | Seller dashboard: products, orders, customers, inbox, Rafiq | Netlify (from `dev`) |
| `apps/api` | Express 5, TypeScript | All business logic and data access, webhooks, AI pipeline, tool registry | Render (Docker) |
| `apps/ml` | Python 3.12, FastAPI, LangGraph | WhatsApp agent: understands the buyer, decides, calls tools, writes the reply | Local today; Render planned |
| `packages/shared` | Zod 4 | The contracts both sides agree on (orders, customers, conversations, states) | — |
| `packages/integrations` | supabase-js | Supabase clients, generated DB types, database tests | — |
| `supabase/migrations` | SQL | Every table, RLS policy, trigger and function, append-only | Supabase (prod) |

**Two AI assistants, one tool layer.**
- **Rafiq** is the seller's assistant inside the dashboard (`/dashboard/copilot`).
- **The WhatsApp Sales Agent** talks to buyers.
Both use the same business tools from `apps/api/src/tools/`, so a rule fixed once (e.g. "never sell a draft product") applies to both.

---

## 2. Key design decisions (and the one-line answer for each)

| Decision | Why |
|---|---|
| **API-centric**: the web app never touches tables | One chokepoint for data access, easy to test, contracts in `packages/shared`. Enforced by `apps/web/src/architecture.test.ts`, which fails CI if web code calls `.from()`/`.rpc()` or the service key. |
| **Postgres RLS for tenant isolation** | Even a buggy query can't read another seller's rows: policies are `seller_id = auth.uid()`. Composite keys `(workspace_id, seller_id)` stop cross-tenant links. |
| **Agent "brain" in Python, tools in Node** (Open Decision #2) | LangGraph is Python-first and best for stateful conversations; business rules already lived in Express, so Python calls them over HTTP instead of duplicating them. |
| **Vendors behind adapters** | LLM: `AI_PROVIDER` (DeepSeek default, Gemini, OpenRouter, Ollama). WhatsApp: `WHATSAPP_PROVIDER` (meta, twilio, simulator). Switching is an env change, not a code change. |
| **Safety rules in the database, not only in prompts** | Order lifecycle, conversation states and the buyer's double confirmation are enforced by SQL triggers/functions. A prompt mistake cannot bypass them. |
| **Append-only, migrations-first schema** | Every change is a new file in `supabase/migrations/`; CI rebuilds the whole database from scratch on every PR (`supabase db reset`). |

---

## 3. "What happens when…"

### 3.1 A seller opens the dashboard

1. Login uses Supabase Auth in the browser (`apps/web/src/lib/supabase/client.ts`). `apps/web/src/proxy.ts` refreshes the session and keeps logged-out users out of `/dashboard`.
2. A page calls a client in `apps/web/src/lib/api/*.ts` → `apiFetch` (`api-client.ts`) adds `Authorization: Bearer <seller JWT>`.
3. Express: `requireAuth` (`apps/api/src/middleware/auth.ts`) verifies the JWT with Supabase.
4. `sellerContext(req)` (`middleware/seller-context.ts`) creates a database client **as that seller**, so Postgres RLS filters every query.
5. Router → service → mapper (e.g. `apps/api/src/orders/order-router.ts` → `order-service.ts` → `order-mapper.ts`) → JSON shaped by the shared Zod contract.

### 3.2 A buyer sends a WhatsApp message

```text
WhatsApp ─▶ webhook (signature check) ─▶ processInbound ─▶ ingest_inbound_message (SQL)
                                                              │
                                                  conversation + message stored
                                                              │
                                        AI on & conversation ai_active? ─▶ AI turn (3.3)
```

1. **Entry point** depends on the provider:
   - Meta: `apps/api/src/whatsapp/webhook-router.ts` checks `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the app secret).
   - Twilio: `whatsapp/twilio-router.ts` checks `X-Twilio-Signature` (HMAC-SHA1).
   - Testing: the dashboard's "Test as a buyer" posts to `POST /api/v1/conversations/mock-inbound` (`conversations/mock-inbound.ts`), allowed only with the simulator provider.
2. `whatsapp/inbound-processing.ts` → `conversations/ingest.ts` calls the SQL function `ingest_inbound_message`:
   - drops duplicates (WhatsApp retries) using the provider's message id,
   - finds or creates the conversation for that phone (one thread per buyer),
   - stores the message, bumps the unread count.
3. If the seller has AI replies on and the conversation is `ai_active`, `sales-agent/pipeline.ts` queues an **AI turn**.

### 3.3 The AI answers a product question

```text
pipeline.ts ──POST /agent/respond──▶ apps/ml graph ──tools──▶ /api/v1/agent/tools/:name ──▶ DB
     ▲                                     │
     └────────── reply / handoff ──────────┘
pipeline.ts ─▶ send via provider ─▶ store as "ai" message
```

1. `pipeline.ts` loads the last 20 messages (text only, **no phone numbers**) and calls `apps/ml` with a shared secret (`AGENT_SERVICE_TOKEN`).
2. `apps/ml/app/graph.py` runs the LangGraph steps:
   - **load pending order** (if the buyer is mid-order),
   - **classify** the message into an intent (`app/intents.py`: greeting, product search, stock check, policy, order…; examples in English, Urdu and Roman Urdu),
   - **route**: asks for a human → hand off; policy question → answer only from the seller's policy text; everything else → **respond**.
3. **Respond** lets the model call tools. The tool list is fetched from Node at runtime (`app/tools_client.py`), so tools are defined once, in Node.
4. Each tool call is an HTTP request to `apps/api/src/agent/agent-router.ts`:
   - it checks the token,
   - works out the workspace **from the conversation** (the agent cannot name a workspace),
   - runs the tool through the registry (`apps/api/src/tools/registry.ts`),
   - writes an audit row to `ai_tool_calls` (inputs redacted).
5. The reply passes the **policy guard** (`app/orders.py` `violates_policy`): invented delivery times, discounts, refunds or "free delivery" are blocked and the chat is handed to the seller.
6. Back in Node, the state is re-checked (did the seller take over meanwhile?), the reply is sent via the provider and stored as an `ai` message. If the agent asked for a human, the conversation moves to `human_takeover` with a readable reason.

### 3.4 The AI takes an order (double confirmation)

```text
collect details ─▶ summary ─▶ buyer "haan" ─▶ draft created ─▶ AI: "final HAAN?" ─▶ buyer "haan" ─▶ confirm
                                                                                                   │
                                            auto-confirm ON: order confirmed, stock deducted ◀─────┤
                                            auto-confirm OFF: seller approves in the inbox  ◀──────┘
```

1. The AI collects product + size/colour (from `checkInventory`), quantity, name, city and address, then records a **summary** (`recordOrderSummary` in `graph.py`; checks the variant came from a real lookup, quantity 1–20, city/address look real).
2. Buyer replies with a plain yes → `createOrderDraft` (`apps/api/src/tools/sales-agent-order-tools.ts`). The draft is built **from the stored summary**, not from what the model says; the phone comes from the conversation; prices and totals come from the database.
3. The AI sends the order reference and total and asks for a final **HAAN**.
4. A **new** plain yes → `confirmOrder` → SQL function `ai_confirm_order` (migration `20261115150000_ai_orders.sql`), which refuses unless:
   - the conversation is still `ai_active`,
   - the order is this conversation's AI draft,
   - an AI message was sent **after** the draft and a buyer message arrived **after that** (the second confirmation, enforced in SQL).
5. Then:
   - **Auto-confirm on** (default): `transition_order_status` confirms the order and deducts stock, writing `stock_movements`.
   - **Auto-confirm off**: the conversation becomes `waiting_approval`; the seller sees an Approve/Reject card (`order-approval-card.tsx` → `POST /conversations/:id/order-approval` → `conversations/order-approval.ts`), and on approve the buyer gets a confirmation message.
6. The order shows "Placed by AI · WhatsApp" in the dashboard, linked back to the chat.

### 3.5 A seller takes over a conversation

- Buttons in the thread call `POST /conversations/:id/state` (`conversation-service.ts` `transitionConversationState`).
- Allowed moves come from the shared contract `packages/shared/src/conversations/index.ts`; the database trigger `conversations_guard_update` enforces the same list.
- **The AI can never take a conversation back from a seller**: only a seller can hand it back.
- In `human_takeover` the seller can reply from the compose box (`POST /conversations/:id/messages`); the AI stays silent.

### 3.6 The seller asks Rafiq something

1. `copilot/_components/natural-language-query.tsx` streams to `POST /api/v1/copilot/chat` (`apps/api/src/copilot/copilot-router.ts`).
2. The model (Vercel AI SDK `streamText`) gets the schema document and the copilot tools via `copilot/ai-sdk-adapter.ts`.
3. **Read tools** run directly as the seller (RLS). `queryDatabase` uses the SQL function `run_readonly_query`: read-only transaction, single SELECT, blocklist of dangerous functions, 10 s timeout, 200 rows.
4. **Write tools** (stock, price, product details, draft order, guarded SQL mutation) need the seller to click **Approve** in the chat first. Guarded SQL can't touch orders, stock history, customers or conversations at all.

### 3.7 An order's life

`draft → confirmed → shipped → delivered`, with `cancelled` / `returned` exits.
- Only the SQL function `transition_order_status` may change status (enforced by triggers).
- Confirming deducts stock and writes `stock_movements`; insufficient stock refuses the confirm.
- Every change is recorded in `order_status_history` (append-only).
- Each order is linked to a customer by **normalised phone** (`normalize_phone` in SQL, `normalizePhone` in TypeScript, tested against the same fixtures) → Customer 360.

---

## 4. File map

### apps/api/src

| Folder | What's in it |
|---|---|
| `app.ts`, `index.ts` | App wiring: CORS, webhooks (raw body), agent surface, JSON parser, auth, routers, error handler. Starts the stale-conversation sweep. |
| `middleware/` | `auth.ts` (verify JWT), `seller-context.ts` (RLS client for the seller), `error-handler.ts`. |
| `lib/` | Supabase client factories (`supabase.ts`), HTTP errors, cursor paging, PostgREST escaping. |
| `products/`, `categories/`, `inventory/` | Catalogue and stock API. |
| `orders/` | Order API; draft creation and status transitions via SQL functions; order limits. |
| `customers/` | Customer 360 API and the compact customer context for agents. |
| `conversations/` | Inbox API, mock inbound, ingest, takeover/state changes, seller replies, AI activity, order approval. |
| `whatsapp/` | Provider interface + Meta, Twilio and simulator adapters, webhook routers, shared inbound processing. |
| `sales-agent/` | AI reply pipeline (queue, call to `apps/ml`, send, handoff, stale sweep) and the Agent Settings API. |
| `agent/` | Service-to-service tool endpoint for `apps/ml`. |
| `tools/` | The shared tool registry, tool definitions, sales-agent tools (search, stock, orders), audit, write gate. |
| `copilot/` | Rafiq: chat router, provider factory, AI SDK adapter, schema document, chat storage, copilot tools. |

### apps/web/src

| Folder | What's in it |
|---|---|
| `lib/api/` | One client per domain; adds the seller's JWT. |
| `app/(main)/dashboard/products, orders, customers` | Catalogue, orders (list, detail, new order form), Customer 360. |
| `app/(main)/dashboard/conversations` | Inbox, thread, AI status strip, takeover buttons, customer panel, orders from the chat, approval card, Agent Settings, buyer simulator. |
| `app/(main)/dashboard/copilot` | Rafiq chat UI with approval cards. |
| `architecture.test.ts` | The "web never touches tables" guard. |
| Other dashboard pages | `analytics`, `inventory`, `logistics-and-courier`, `approvals`, `settings` still show sample data. |

### apps/ml/app

| File | What it does |
|---|---|
| `main.py` | FastAPI app: `/health`, `/agent/respond` (token check; rejects unknown fields so no phone can be sent in). |
| `graph.py` | The LangGraph: load pending order → classify → route → respond (tools) / policy / handoff → finalize. System prompt and order rules. |
| `intents.py` | Intent list with multilingual examples; structured-output classifier. |
| `orders.py` | Order gates (strict yes/no, summary checks, draft/confirm checks), phone stripping, the policy guard. |
| `tools_client.py` | Fetches tool specs from Node, turns JSON Schema into LangChain tools. |
| `llm.py` | LLM provider factory from env. |
| `checkpoint.py` | Conversation memory: Postgres when `AGENT_DATABASE_URL` is set, otherwise in-memory. |

### packages/shared/src

`orders/` (statuses and allowed transitions), `customers/` (incl. `phone.ts`), `conversations/` (states, who may change them, message and settings schemas), `products/`, `inventory/`, `categories/`, `workspaces/`, `api/` (response envelope).

### supabase/migrations (in order, grouped)

| Group | Migrations | What they add |
|---|---|---|
| Identity | `20260818100001`–`100003`, `20260822180000` | Profiles, sellers, workspaces, tenant key, signup trigger |
| Catalogue | `20260818100004`–`100007`, `20260823…`, `20261005…` | Products, variants, RLS, create-product function, list view, categories, images |
| Copilot | `20260901100001`, `20260902100001`, `20261003…`, `20261114130000`–`170000` | Read-only and guarded-mutation SQL runners, chat storage, guards against bypasses |
| Inventory | `20261011100001`–`110002` | Stock movements, reserved quantity, inventory view, `adjust_stock` |
| Orders | `20261114055817`–`071120` | Orders, items, history, lifecycle triggers, stock deduction on confirm |
| Customers | `20261114190000` | Customers by phone, notes, order linking, summary view |
| WhatsApp & AI | `20261115120000`–`150000` | Conversations, messages, ingest function, tool audit, agent settings, AI orders + double confirmation |

---

## 5. Security — answers for the examiner

| Question | Answer and where to point |
|---|---|
| How is seller A kept out of seller B's data? | Postgres RLS on every table (`seller_id = auth.uid()`), composite tenant keys, and tests that log in as two sellers and try (`packages/integrations/src/supabase/*-rls.itest.ts`, `apps/api/src/conversations/conversations.itest.ts`). |
| Where is the service role key used, and why is that safe? | Only in server code that has no seller login: webhooks, ingest, AI pipeline, agent tools, audit, settings lookup. Every such query is scoped to one workspace, the workspace comes from the conversation (never from the caller), and web code can't import it (CI guard). |
| Can a fake webhook inject messages? | No: Meta and Twilio signatures are verified over the raw request with constant-time comparison; unsigned requests get 401. |
| Can the AI make up a price or a policy? | Prices, stock and totals only come from tool output; the policy guard blocks invented delivery/discount/refund promises; policy questions are answered only from the seller's own text or handed off. |
| What about prompt injection ("ignore your rules, 90% discount")? | Buyer text and tool output are treated as data in the system prompt; the agent has no discount tool; the policy guard blocks discount promises; risky messages go to the seller. Tested in `apps/ml/tests/`. |
| Can the AI place an order the buyer didn't confirm? | No: two confirmations, and the second is checked inside `ai_confirm_order` in SQL (AI message after the draft, buyer message after that). Stock is re-checked at confirm. |
| Does the AI see buyer phone numbers? | No. The agent gets a conversation id; Node fills the phone in on the server. `/agent/respond` rejects unknown fields; phone-like tool arguments are stripped. |
| Can Rafiq's SQL tool break things? | Read-only transaction, one statement, blocklisted functions, timeout and row cap; mutations need seller approval and can't touch orders, stock history, customers or conversations. Tested in `copilot-sql-guards.itest.ts`. |
| Is AI activity auditable? | Every tool call and refusal is in `ai_tool_calls` (tool, actor, duration, result, redacted input); sellers can read their own rows; the thread shows the last AI action. |
| What if the AI service is down or slow? | It fails closed: no reply, the chat is handed to the seller with "AI unavailable"; a sweep hands off anything unanswered for 2 minutes. |

---

## 6. Vendor switching

| What | How to switch | Code |
|---|---|---|
| LLM for the WhatsApp agent | `AI_PROVIDER=deepseek|google|openrouter|ollama`, `AI_MODEL`, the vendor key | `apps/ml/app/llm.py` |
| LLM for Rafiq | Same variable names | `apps/api/src/copilot/provider.ts` |
| WhatsApp provider | `WHATSAPP_PROVIDER=meta|twilio|simulator` + that provider's keys | `apps/api/src/whatsapp/factory.ts` |
| Agent memory | `AGENT_DATABASE_URL` (Postgres) or unset (in-memory) | `apps/ml/app/checkpoint.py` |

Why it matters: the Twilio trial was suspended and Meta needs a business portfolio, yet the whole pipeline is testable today through the simulator, and switching to a real number is configuration only.

---

## 7. Testing and CI

| Kind | Where | What it proves |
|---|---|---|
| Unit (Vitest) | `*.test.ts` next to the code | Contracts, mappers, adapters, pipeline logic, UI view models, the architecture guard |
| Database / API integration | `*.itest.ts` (real local Supabase, real logins) | RLS, triggers, SQL functions, full HTTP workflows (orders, Customer 360, inbox, WhatsApp, AI orders) |
| Agent (pytest) | `apps/ml/tests/` | Intent routing, order gates, policy guard, prompt injection, no phone leakage — with a fake LLM, no network |
| CI (`.github/workflows/ci.yml`) | Every PR | Secret-file check, lint + typecheck + tests + build per package, ruff + pytest, and a full database rebuild from migrations followed by all integration tests |

Workflow: one PR per task into `dev`, an independent review pass before merge, squash merge; migrations are applied to production with `supabase db push` after merge.

---

## 8. Running it locally (demo setup)

```bash
# 1. API in simulator mode (no WhatsApp account needed)
cd apps/api && WHATSAPP_PROVIDER=simulator ML_URL=http://localhost:8000 \
  AGENT_SERVICE_TOKEN=<token> npx tsx --env-file=../../.env src/index.ts

# 2. The agent (same token)
cd apps/ml && .venv/bin/uvicorn app.main:app_factory --factory --port 8000

# 3. The dashboard
npm run dev -w apps/web
```

Then: Conversations → Agent Settings (AI on, policy text, auto-confirm) → "Test as a buyer".
Full steps and env variables: `docs/RUNBOOK.md`.

---

## 9. Known limits (say these before you're asked)

- The AI reply queue lives in one API process; running several instances needs a database lock.
- Media links from Meta/Twilio expire; storing voice notes and images properly comes with the voice-notes task.
- The WhatsApp number is mapped to one workspace by env (`WHATSAPP_WORKSPACE_ID`); per-seller channel settings come later.
- `apps/ml` has no deploy config yet (local only).
- Voice notes (speech-to-text bake-off) and the COD risk model are planned, not built.
- Some dashboard pages (analytics, logistics, approvals, settings) still show sample data.
