-- WhatsApp inbox: conversations and messages.
--
-- Buyer phones and private messages live here, so the rules are strict and sit
-- in the database rather than in each caller.
--
-- ONE THREAD PER BUYER. A conversation is identified by
-- (workspace, channel, normalised phone). The phone is normalised by a trigger,
-- so every insert path stores the same key.
--
-- WHO WRITES WHAT.
--   * Inbound and AI messages, and new conversations, are written only by
--     trusted server code (service role), through ingest_inbound_message() for
--     inbound traffic.
--   * A seller (authenticated) can read both tables, update a conversation's
--     state / handoff_reason / unread_count, and insert a queued seller message
--     into their own conversation. Nothing else, and no deletes.
--
-- STATE MACHINE. The edges below mirror CONVERSATION_TRANSITION_EDGES in
-- packages/shared/src/conversations/index.ts; conversations-schema.itest.ts
-- tries every state pair against that export. The database only sees edges.
-- Which actor may make a move is checked by the API (assertConversationTransition).
--
-- MESSAGES ARE APPEND-ONLY. Only `status` may change (provider delivery
-- callbacks). It is not forced to move forward because provider callbacks can
-- arrive out of order.
--
-- CUSTOMER LINK. conversations.customer_id points at the customer with the same
-- (workspace, phone) when one exists. It is filled when the conversation is
-- created and when a matching customer is created later. A conversation never
-- creates a customer. If the customer is deleted the link is cleared.
--
-- Mirrors packages/shared/src/conversations/index.ts.

create type public.conversation_state as enum (
  'open', 'ai_active', 'waiting_approval', 'human_takeover', 'closed'
);
create type public.message_direction as enum ('inbound', 'outbound');
create type public.message_sender as enum ('buyer', 'ai', 'seller', 'system');
create type public.message_status as enum (
  'received', 'queued', 'sent', 'delivered', 'read', 'failed'
);

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,
  seller_id uuid not null,

  channel text not null default 'whatsapp',
  -- Normalised by conversations_prepare_insert. The buyer's identity.
  buyer_phone text not null,
  -- Name the buyer shows on WhatsApp. Not verified.
  buyer_name text,

  -- Customer 360 record with the same phone, when one exists.
  customer_id uuid,

  state public.conversation_state not null default 'open',
  handoff_reason text,
  unread_count integer not null default 0,

  last_message_at timestamptz,
  last_message_preview text,
  last_message_sender public.message_sender,

  state_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint conversations_workspace_seller_fkey
    foreign key (workspace_id, seller_id)
    references public.workspaces (id, seller_id)
    on delete cascade,

  -- A customer can be deleted (drop_orphan_customer); the link is then cleared.
  -- Column list (Postgres 15+) so workspace_id, which is NOT NULL, is untouched.
  constraint conversations_customer_workspace_fkey
    foreign key (customer_id, workspace_id)
    references public.customers (id, workspace_id)
    on delete set null (customer_id),

  constraint conversations_id_workspace_id_key unique (id, workspace_id),
  constraint conversations_workspace_channel_phone_key
    unique (workspace_id, channel, buyer_phone),

  constraint conversations_channel_valid check (channel in ('whatsapp')),
  constraint conversations_phone_normalised check (
    buyer_phone <> '' and buyer_phone = public.normalize_phone(buyer_phone)
  ),
  constraint conversations_phone_max_length check (char_length(buyer_phone) <= 32),
  constraint conversations_buyer_name_max_length
    check (buyer_name is null or char_length(buyer_name) <= 200),
  constraint conversations_handoff_reason_max_length
    check (handoff_reason is null or char_length(handoff_reason) <= 500),
  constraint conversations_unread_count_nonnegative check (unread_count >= 0),
  constraint conversations_preview_max_length
    check (last_message_preview is null or char_length(last_message_preview) <= 160)
);

create index conversations_workspace_last_message_idx
  on public.conversations (workspace_id, last_message_at desc nulls last);
create index conversations_seller_id_idx on public.conversations (seller_id);
-- Serves the ON DELETE SET NULL action when a customer is deleted.
create index conversations_customer_id_idx
  on public.conversations (customer_id) where customer_id is not null;

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row
  execute function public.set_updated_at();

comment on table public.conversations is
  'One WhatsApp thread per buyer phone per workspace. Created by ingest_inbound_message (service role). Sellers update state, handoff_reason and unread_count only.';
comment on column public.conversations.buyer_phone is
  'Normalised with normalize_phone(). Never changes.';
comment on column public.conversations.customer_id is
  'Set by the database from the phone when a customer exists. Cleared if the customer is deleted.';

-- BEFORE INSERT: normalise the phone, link an existing customer.
create or replace function public.conversations_prepare_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.buyer_phone := public.normalize_phone(new.buyer_phone);
  if new.buyer_phone is null or new.buyer_phone = '' then
    raise exception 'buyer phone must contain digits'
      using errcode = 'check_violation',
            constraint = 'conversations_phone_normalised';
  end if;

  new.buyer_name := nullif(btrim(new.buyer_name), '');

  select c.id into new.customer_id
  from public.customers c
  where c.workspace_id = new.workspace_id and c.phone = new.buyer_phone;

  return new;
end;
$$;

comment on function public.conversations_prepare_insert() is
  'BEFORE INSERT on conversations: normalises buyer_phone (refuses no digits) and links the customer with the same phone, if any.';
revoke execute on function public.conversations_prepare_insert() from public, anon, authenticated;

create trigger conversations_prepare_insert
  before insert on public.conversations
  for each row execute function public.conversations_prepare_insert();

-- BEFORE UPDATE: state machine, state_changed_at, handoff_reason, immutables.
create or replace function public.conversations_guard_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id
     or new.seller_id is distinct from old.seller_id
     or new.channel is distinct from old.channel
     or new.buyer_phone is distinct from old.buyer_phone then
    raise exception 'conversation workspace, seller, channel and buyer phone cannot be changed'
      using errcode = 'restrict_violation';
  end if;

  if new.state is distinct from old.state then
    -- Keep in step with CONVERSATION_TRANSITION_EDGES (packages/shared).
    if (old.state::text || '>' || new.state::text) <> all (array[
      'open>ai_active', 'open>human_takeover', 'open>closed',
      'ai_active>open', 'ai_active>waiting_approval', 'ai_active>human_takeover',
      'ai_active>closed',
      'waiting_approval>open', 'waiting_approval>ai_active',
      'waiting_approval>human_takeover', 'waiting_approval>closed',
      'human_takeover>open', 'human_takeover>ai_active', 'human_takeover>closed',
      'closed>open', 'closed>ai_active'
    ]) then
      raise exception 'illegal conversation transition: % -> %', old.state, new.state
        using errcode = 'check_violation';
    end if;
    new.state_changed_at := now();
  end if;

  if new.state <> 'human_takeover' then
    new.handoff_reason := null;
  end if;

  return new;
end;
$$;

comment on function public.conversations_guard_update() is
  'BEFORE UPDATE on conversations: only contract state transitions, stamps state_changed_at, clears handoff_reason outside human_takeover, refuses changes to identity columns.';
revoke execute on function public.conversations_guard_update() from public, anon, authenticated;

create trigger conversations_guard_update
  before update on public.conversations
  for each row execute function public.conversations_guard_update();

-- A customer created after the conversation: fill in the link. SECURITY DEFINER
-- because the customer may be created by a seller, who has no UPDATE right on
-- conversations.customer_id.
create or replace function public.link_customer_to_conversations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations c
  set customer_id = new.id
  where c.workspace_id = new.workspace_id
    and c.buyer_phone = new.phone
    and c.customer_id is null;
  return null;
end;
$$;

comment on function public.link_customer_to_conversations() is
  'AFTER INSERT on customers: links conversations with the same (workspace, phone) that have no customer yet.';
revoke execute on function public.link_customer_to_conversations() from public, anon, authenticated;

create trigger customers_link_conversations
  after insert on public.customers
  for each row execute function public.link_customer_to_conversations();

-- Conversations are written by the inbox, never by the copilot's free-form SQL tool.
create trigger conversations_refuse_copilot_mutation
  before insert or update or delete on public.conversations
  for each statement execute function public.refuse_copilot_mutation();

revoke all on public.conversations from anon, authenticated;
grant select on public.conversations to authenticated;
-- Column-level: a seller handles the thread, they do not rewrite its identity,
-- customer link or message summary.
grant update (state, handoff_reason, unread_count) on public.conversations to authenticated;
grant all on public.conversations to service_role;

alter table public.conversations enable row level security;

create policy conversations_select_own
  on public.conversations for select to authenticated
  using (seller_id = (select auth.uid()));

create policy conversations_update_own
  on public.conversations for update to authenticated
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------

create table public.messages (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,
  seller_id uuid not null,
  conversation_id uuid not null,

  direction public.message_direction not null,
  sender public.message_sender not null,
  body text,
  -- [{ "url": ..., "contentType": ... }], see messageMediaSchema.
  media jsonb not null default '[]'::jsonb,
  -- Twilio MessageSid. Deduplicates provider webhook retries.
  provider_message_id text,
  status public.message_status not null,

  created_at timestamptz not null default now(),

  constraint messages_workspace_seller_fkey
    foreign key (workspace_id, seller_id)
    references public.workspaces (id, seller_id)
    on delete cascade,

  constraint messages_conversation_workspace_fkey
    foreign key (conversation_id, workspace_id)
    references public.conversations (id, workspace_id)
    on delete cascade,

  constraint messages_body_max_length
    check (body is null or char_length(body) <= 4096),
  constraint messages_media_is_array check (
    case when jsonb_typeof(media) = 'array'
         then jsonb_array_length(media) <= 10
         else false end
  ),
  constraint messages_has_content check (
    (body is not null and btrim(body) <> '')
    or case when jsonb_typeof(media) = 'array'
            then jsonb_array_length(media) > 0
            else false end
  ),
  constraint messages_provider_id_not_blank
    check (provider_message_id is null or btrim(provider_message_id) <> ''),
  constraint messages_inbound_consistent check (
    direction <> 'inbound' or (sender = 'buyer' and status = 'received')
  ),
  constraint messages_outbound_consistent check (
    direction <> 'outbound' or (sender in ('ai', 'seller', 'system') and status <> 'received')
  )
);

create unique index messages_workspace_provider_message_key
  on public.messages (workspace_id, provider_message_id)
  where provider_message_id is not null;
create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);
create index messages_seller_id_idx on public.messages (seller_id);

comment on table public.messages is
  'Append-only WhatsApp messages. Only status can change. Inbound and AI rows are written by trusted server code; a seller can insert only queued seller messages.';
comment on column public.messages.provider_message_id is
  'Twilio MessageSid. Unique per workspace when present, so a retried webhook cannot create a second row.';

-- Append-only: provider callbacks may move `status`, nothing else changes.
create or replace function public.messages_refuse_edit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.id, new.workspace_id, new.seller_id, new.conversation_id, new.direction,
      new.sender, new.body, new.media, new.provider_message_id, new.created_at)
     is distinct from
     (old.id, old.workspace_id, old.seller_id, old.conversation_id, old.direction,
      old.sender, old.body, old.media, old.provider_message_id, old.created_at) then
    raise exception 'messages are append-only: only status can change'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

comment on function public.messages_refuse_edit() is
  'BEFORE UPDATE on messages: allows only status to change.';
revoke execute on function public.messages_refuse_edit() from public, anon, authenticated;

create trigger messages_refuse_edit
  before update on public.messages
  for each row execute function public.messages_refuse_edit();

-- Keep the inbox summary in step. SECURITY DEFINER because a seller inserting a
-- message has no UPDATE right on these conversation columns.
create or replace function public.messages_update_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations c
  set last_message_at = new.created_at,
      last_message_preview = case
        when nullif(btrim(new.body), '') is null then '[media]'
        else left(new.body, 160)
      end,
      last_message_sender = new.sender,
      unread_count = c.unread_count + case when new.direction = 'inbound' then 1 else 0 end
  where c.id = new.conversation_id
    and c.workspace_id = new.workspace_id;
  return null;
end;
$$;

comment on function public.messages_update_conversation() is
  'AFTER INSERT on messages: refreshes last_message_*, and unread_count for inbound messages.';
revoke execute on function public.messages_update_conversation() from public, anon, authenticated;

create trigger messages_update_conversation
  after insert on public.messages
  for each row execute function public.messages_update_conversation();

create trigger messages_refuse_copilot_mutation
  before insert or update or delete on public.messages
  for each statement execute function public.refuse_copilot_mutation();

revoke all on public.messages from anon, authenticated;
grant select, insert on public.messages to authenticated;
grant all on public.messages to service_role;

alter table public.messages enable row level security;

create policy messages_select_own
  on public.messages for select to authenticated
  using (seller_id = (select auth.uid()));

-- A seller can only queue their own reply. Inbound and AI rows come from the
-- server (service role). The composite foreign keys tie the conversation to the
-- same workspace and seller.
create policy messages_insert_seller_reply
  on public.messages for insert to authenticated
  with check (
    seller_id = (select auth.uid())
    and direction = 'outbound'
    and sender = 'seller'
    and status = 'queued'
  );

-- ---------------------------------------------------------------------------
-- ingest_inbound_message
-- ---------------------------------------------------------------------------

-- One atomic step for a buyer's WhatsApp message: find or create the thread,
-- reopen it if closed, store the message. Safe to call twice with the same
-- provider id: the second call returns the first message with duplicate = true.
create or replace function public.ingest_inbound_message(
  p_workspace_id uuid,
  p_buyer_phone text,
  p_buyer_name text,
  p_provider_message_id text,
  p_body text,
  p_media jsonb,
  p_ai_enabled boolean
)
returns table (
  conversation_id uuid,
  message_id uuid,
  duplicate boolean,
  state public.conversation_state
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_seller_id uuid;
  v_provider_id text := nullif(btrim(p_provider_message_id), '');
  v_conversation_id uuid;
  v_state public.conversation_state;
  v_message_id uuid;
begin
  select w.seller_id into v_seller_id
  from public.workspaces w
  where w.id = p_workspace_id;

  if v_seller_id is null then
    raise exception 'workspace % not found', p_workspace_id
      using errcode = 'foreign_key_violation';
  end if;

  -- Serialise retries of the same provider message so the duplicate check below
  -- cannot race (the unique index is the backstop).
  if v_provider_id is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(p_workspace_id::text || ':' || v_provider_id, 0));

    select m.id, m.conversation_id, c.state
      into v_message_id, v_conversation_id, v_state
    from public.messages m
    join public.conversations c
      on c.id = m.conversation_id and c.workspace_id = m.workspace_id
    where m.workspace_id = p_workspace_id and m.provider_message_id = v_provider_id;

    if v_message_id is not null then
      return query select v_conversation_id, v_message_id, true, v_state;
      return;
    end if;
  end if;

  insert into public.conversations as c (workspace_id, seller_id, buyer_phone, buyer_name)
  values (p_workspace_id, v_seller_id, p_buyer_phone, p_buyer_name)
  on conflict (workspace_id, channel, buyer_phone) do update
    set buyer_name = coalesce(nullif(btrim(excluded.buyer_name), ''), c.buyer_name)
  returning c.id, c.state into v_conversation_id, v_state;

  -- Live states keep their state; a closed thread reopens (stateAfterBuyerMessage).
  if v_state = 'closed' then
    update public.conversations c
    set state = case when p_ai_enabled then 'ai_active' else 'open' end::public.conversation_state
    where c.id = v_conversation_id
    returning c.state into v_state;
  end if;

  insert into public.messages
    (workspace_id, seller_id, conversation_id, direction, sender, body, media,
     provider_message_id, status)
  values (
    p_workspace_id, v_seller_id, v_conversation_id, 'inbound', 'buyer',
    case when btrim(p_body) = '' then null else p_body end,
    coalesce(p_media, '[]'::jsonb), v_provider_id, 'received'
  )
  on conflict (workspace_id, provider_message_id) where provider_message_id is not null
  do nothing
  returning id into v_message_id;

  if v_message_id is null then
    -- Lost a race with another delivery of the same message.
    select m.id into v_message_id
    from public.messages m
    where m.workspace_id = p_workspace_id and m.provider_message_id = v_provider_id;
    return query select v_conversation_id, v_message_id, true, v_state;
    return;
  end if;

  return query select v_conversation_id, v_message_id, false, v_state;
end;
$$;

comment on function public.ingest_inbound_message(uuid, text, text, text, text, jsonb, boolean) is
  'Service role only. Atomically finds or creates the buyer thread, reopens a closed one (ai_active when p_ai_enabled, else open), and stores the inbound message. A repeated provider message id returns the existing message with duplicate = true and changes nothing.';

revoke execute on function public.ingest_inbound_message(uuid, text, text, text, text, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.ingest_inbound_message(uuid, text, text, text, text, jsonb, boolean)
  to service_role;
