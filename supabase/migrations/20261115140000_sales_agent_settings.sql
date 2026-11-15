-- Sales agent settings (T-079): one row per workspace.
--
-- ai_enabled: whether new/reopened WhatsApp conversations start with the AI
-- answering (ai_active). Off by default, so nothing changes until a seller opts in.
-- policy_text: the seller's delivery / returns / payment (COD) wording. The agent
-- may only quote it; without it, policy questions hand off to the seller.
--
-- Sellers read, insert and update their own row. No deletes, nothing for anon.
-- The API reads it with the service role when ingesting an inbound message.

create table public.sales_agent_settings (
  workspace_id uuid primary key,
  seller_id uuid not null,

  ai_enabled boolean not null default false,
  policy_text text,

  updated_at timestamptz not null default now(),

  constraint sales_agent_settings_workspace_seller_fkey
    foreign key (workspace_id, seller_id)
    references public.workspaces (id, seller_id)
    on delete cascade,

  constraint sales_agent_settings_policy_text_length
    check (policy_text is null or char_length(policy_text) <= 4000)
);

create index sales_agent_settings_seller_id_idx on public.sales_agent_settings (seller_id);

create trigger sales_agent_settings_set_updated_at
  before update on public.sales_agent_settings
  for each row
  execute function public.set_updated_at();

comment on table public.sales_agent_settings is
  'Per-workspace Sales Agent switch and store policy text. Sellers manage their own row; no deletes.';

-- The copilot's free-form SQL tool must not change what the buyer-facing agent may say.
create trigger sales_agent_settings_refuse_copilot_mutation
  before insert or update or delete on public.sales_agent_settings
  for each statement execute function public.refuse_copilot_inbox_mutation();

revoke all on public.sales_agent_settings from anon, authenticated;
grant select, insert on public.sales_agent_settings to authenticated;
-- Column-level: the owner of a row never changes.
grant update (ai_enabled, policy_text) on public.sales_agent_settings to authenticated;
grant all on public.sales_agent_settings to service_role;

alter table public.sales_agent_settings enable row level security;

create policy sales_agent_settings_select_own
  on public.sales_agent_settings for select to authenticated
  using (seller_id = (select auth.uid()));

create policy sales_agent_settings_insert_own
  on public.sales_agent_settings for insert to authenticated
  with check (seller_id = (select auth.uid()));

create policy sales_agent_settings_update_own
  on public.sales_agent_settings for update to authenticated
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));
