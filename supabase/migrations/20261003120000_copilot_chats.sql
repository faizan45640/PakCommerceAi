-- One row per Rafiq chat.
--
-- The Vercel AI SDK persists a chat as a UIMessage array (id, role, parts),
-- saved and loaded as a whole. Tool calls and the approval card live inside
-- `parts`. A child messages table would only repeat that array.
--
-- The seller-facing name is Rafiq. This table stays copilot, with the route.
-- validateUIMessages in the copilot route checks the array against the current
-- tools. Copying the SDK's message type into a second schema would drift.

create table public.copilot_chats (
  id uuid primary key default gen_random_uuid(),

  -- Tenancy. The composite foreign key makes workspace and seller agree.
  workspace_id uuid not null,
  seller_id uuid not null,

  -- First question, for the list. Null until the seller sends one.
  title text,

  -- UIMessage[]. Replaced as a whole when a turn finishes.
  messages jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint copilot_chats_workspace_seller_fkey
    foreign key (workspace_id, seller_id)
    references public.workspaces (id, seller_id)
    on delete cascade,

  constraint copilot_chats_title_not_blank check (title is null or btrim(title) <> ''),
  constraint copilot_chats_title_max_length check (title is null or char_length(title) <= 120),
  constraint copilot_chats_messages_is_array check (jsonb_typeof(messages) = 'array')
);

-- The chat list is "this workspace, newest first".
create index copilot_chats_workspace_updated_idx
  on public.copilot_chats (workspace_id, updated_at desc);

create index copilot_chats_seller_id_idx on public.copilot_chats (seller_id);

create trigger copilot_chats_set_updated_at
  before update on public.copilot_chats
  for each row
  execute function public.set_updated_at();

comment on table public.copilot_chats is
  'One Rafiq conversation. messages is the Vercel AI SDK UIMessage array.';

comment on column public.copilot_chats.messages is
  'UIMessage[] saved whole by the copilot route. Tool parts and approval state live here.';

-- Privileges, then policies. Supabase grants new tables to anon by default,
-- so the revoke is required or a logged-out request can reach the table.
grant select, insert, update, delete on public.copilot_chats to authenticated, service_role;
revoke all on public.copilot_chats from anon;

alter table public.copilot_chats enable row level security;

create policy copilot_chats_select_own
  on public.copilot_chats for select to authenticated
  using (seller_id = (select auth.uid()));

create policy copilot_chats_insert_own
  on public.copilot_chats for insert to authenticated
  with check (seller_id = (select auth.uid()));

create policy copilot_chats_update_own
  on public.copilot_chats for update to authenticated
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));

create policy copilot_chats_delete_own
  on public.copilot_chats for delete to authenticated
  using (seller_id = (select auth.uid()));
