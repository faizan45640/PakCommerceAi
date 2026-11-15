-- Audit log for AI tool calls (T-076).
--
-- One row per call of a tool in the shared tool registry (apps/api/src/tools),
-- from both callers: the seller copilot (Rafiq) and the WhatsApp sales agent.
--
-- APPEND-ONLY, SERVER-WRITTEN. Only trusted server code (service role) inserts.
-- A seller can read the rows of their own shop and nothing else; nobody can
-- update or delete through the API. `input` is stored already redacted (the
-- tool's audit.redact list is applied before the insert).

create table public.ai_tool_calls (
  id uuid primary key default gen_random_uuid(),

  seller_id uuid not null,
  -- Null for copilot calls: the copilot works as the seller, not inside one
  -- workspace. Always set for sales-agent calls (taken from the conversation).
  workspace_id uuid,
  conversation_id uuid references public.conversations (id) on delete set null,

  tool_name text not null,
  audience text not null,
  actor text not null,

  ok boolean not null,
  error_code text,
  duration_ms integer not null,
  input jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  constraint ai_tool_calls_audience_valid check (audience in ('copilot', 'sales_agent')),
  constraint ai_tool_calls_actor_valid check (actor in ('seller', 'ai')),
  constraint ai_tool_calls_tool_name_length check (char_length(tool_name) between 1 and 100),
  constraint ai_tool_calls_error_code_length
    check (error_code is null or char_length(error_code) <= 100),
  constraint ai_tool_calls_duration_nonnegative check (duration_ms >= 0)
);

create index ai_tool_calls_seller_created_idx
  on public.ai_tool_calls (seller_id, created_at desc);
create index ai_tool_calls_conversation_idx
  on public.ai_tool_calls (conversation_id) where conversation_id is not null;

revoke all on public.ai_tool_calls from anon, authenticated;
grant select on public.ai_tool_calls to authenticated;
grant all on public.ai_tool_calls to service_role;

alter table public.ai_tool_calls enable row level security;

create policy ai_tool_calls_select_own
  on public.ai_tool_calls for select to authenticated
  using (seller_id = (select auth.uid()));
