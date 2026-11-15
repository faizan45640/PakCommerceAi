# apps/ml - WhatsApp Sales Agent (FastAPI + LangGraph)

Python service that decides how to answer a buyer's WhatsApp message. Business
tools (`searchProducts`, `checkInventory`, ...) stay in Express; this service
fetches their specs from `GET {API_URL}/api/v1/agent/tools` and calls them over
HTTP, so tools are defined once, in Node. Intents: see `docs/agent-intents.md`.

```
classify -> handoff | policy | respond -> finalize
```

## Run locally

```bash
cd apps/ml
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
export AGENT_SERVICE_TOKEN=dev-token API_URL=http://localhost:4000 DEEPSEEK_API_KEY=...
uvicorn app.main:app_factory --factory --reload --port 8000
```

```bash
curl -s localhost:8000/agent/respond -H "X-Agent-Token: dev-token" -H "content-type: application/json" \
  -d '{"conversationId":"<uuid>","message":{"body":"ye kurta medium mein hai?"}}'
```

Checks: `ruff check . && ruff format --check . && pytest tests/` (no network, no real LLM).

## API

`POST /agent/respond` (auth: `X-Agent-Token` or `Authorization: Bearer`; 503 if
`AGENT_SERVICE_TOKEN` is unset). Body: `conversationId`, `message {body, media?[{contentType, transcript}]}`,
optional `history [{role, content}]`, `policyText` (seller policy; without it
policy questions hand off), `conversationState` (anything but `ai_active` returns no reply).
Unknown fields (for example a phone number) are rejected. Response:
`{ reply | null, intent, confidence, handoff {required, reason}, toolCalls [{name, ok}] }`.
`reply: null` with `handoff.required: true` means a human must take over.
`GET /health`.

## Environment

| Variable | Purpose |
|---|---|
| `AGENT_SERVICE_TOKEN` | Shared secret, inbound auth and outbound to Node. Required. |
| `API_URL` | Express base URL for tools. |
| `AI_PROVIDER` | `deepseek` (default) / `google` / `openrouter` / `ollama`. Same names as the Node copilot. |
| `AI_MODEL` | Model id; per-provider default if unset. |
| `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENROUTER_API_KEY`, `OLLAMA_BASE_URL` | Vendor credentials. |
| `AGENT_DATABASE_URL` | Postgres checkpointer. Direct or session-pooler URL (not the transaction pooler). Unset = in-memory. |

Switching vendor is env-only, for example `AI_PROVIDER=google AI_MODEL=gemini-2.5-flash`.

Logs never contain message bodies or phone numbers; the agent only ever sees a `conversationId`.
