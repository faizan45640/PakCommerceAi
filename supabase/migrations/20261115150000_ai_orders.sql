-- S11 WhatsApp AI draft orders (T-085 / T-086).
--
-- 1. orders remember where they came from: created_via, conversation_id, and the
--    audit row of the tool call that created them.
-- 2. sales_agent_settings gain auto_confirm_orders and shipping_fee_minor.
-- 3. The AI's order writes are atomic SQL functions that re-check, under a row
--    lock, that the conversation is still `ai_active` (write-gate.ts contract),
--    and that enforce the buyer's SECOND confirmation inside the database.
-- 4. A conversation in `waiting_approval` keeps its handoff_reason, so the inbox
--    can say which order needs approval.
--
-- COLUMN GRANTS. Sellers had a table-wide INSERT/UPDATE on orders. That is cut
-- down to the pre-existing columns, so conversation_id and created_by_tool_call_id
-- cannot be written through PostgREST, and created_via can only be set at insert
-- (and never to 'whatsapp_ai', see the trigger below).

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------

alter table public.orders
  add column created_via text not null default 'manual',
  add column conversation_id uuid,
  -- No FK: the audit row is written after the order and may fail.
  add column created_by_tool_call_id uuid;

alter table public.orders
  add constraint orders_created_via_valid
    check (created_via in ('manual', 'copilot', 'whatsapp_ai'));

-- Tenant-safe link; a deleted conversation only clears the link (Postgres 15+
-- column list, so the NOT NULL workspace_id is untouched).
alter table public.orders
  add constraint orders_conversation_workspace_fkey
    foreign key (conversation_id, workspace_id)
    references public.conversations (id, workspace_id)
    on delete set null (conversation_id);

create index orders_conversation_idx
  on public.orders (conversation_id) where conversation_id is not null;

-- At most one open AI draft per conversation (atomic draft_exists).
create unique index orders_one_open_ai_draft_per_conversation
  on public.orders (conversation_id)
  where created_via = 'whatsapp_ai' and status = 'draft' and conversation_id is not null;

comment on column public.orders.created_via is
  'manual (dashboard / REST), copilot (Rafiq tool) or whatsapp_ai (sales agent, service role only).';
comment on column public.orders.conversation_id is
  'The WhatsApp conversation an AI draft came from. Set by create_draft_order for the sales agent only.';
comment on column public.orders.created_by_tool_call_id is
  'ai_tool_calls.id of the tool call that created the order. Not a foreign key.';

-- Only the service role may mint 'whatsapp_ai' orders.
create or replace function public.orders_guard_created_via()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.created_via = 'whatsapp_ai' and current_user in ('authenticated', 'anon') then
    raise exception 'created_via whatsapp_ai is reserved for the sales agent'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.orders_guard_created_via() from public, anon, authenticated;

create trigger orders_guard_created_via
  before insert on public.orders
  for each row execute function public.orders_guard_created_via();

-- Column-level grants (see header).
revoke insert, update on public.orders from authenticated;
grant insert (
  id, workspace_id, seller_id, status, channel, payment_method,
  customer_name, customer_phone, customer_city, customer_email, customer_address_line,
  subtotal_amount_minor, shipping_fee_amount_minor, total_amount_minor, currency, note,
  confirmed_at, cancelled_at, created_at, updated_at, customer_id, created_via
) on public.orders to authenticated;
grant update (
  id, workspace_id, seller_id, status, channel, payment_method,
  customer_name, customer_phone, customer_city, customer_email, customer_address_line,
  subtotal_amount_minor, shipping_fee_amount_minor, total_amount_minor, currency, note,
  confirmed_at, cancelled_at, created_at, updated_at, customer_id
) on public.orders to authenticated;

-- ---------------------------------------------------------------------------
-- sales_agent_settings
-- ---------------------------------------------------------------------------

alter table public.sales_agent_settings
  add column auto_confirm_orders boolean not null default true,
  add column shipping_fee_minor integer not null default 0
    check (shipping_fee_minor >= 0 and shipping_fee_minor <= 2147483647);

grant update (ai_enabled, policy_text, auto_confirm_orders, shipping_fee_minor)
  on public.sales_agent_settings to authenticated;

-- ---------------------------------------------------------------------------
-- waiting_approval keeps its handoff_reason
-- ---------------------------------------------------------------------------

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

  -- waiting_approval says which order needs the seller; every other live state has no reason.
  if new.state not in ('human_takeover', 'waiting_approval') then
    new.handoff_reason := null;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_draft_order: created_via, and the sales agent's conversation link
-- ---------------------------------------------------------------------------

-- payload.created_via (default manual) is insertable by sellers. For the sales
-- agent the payload also carries conversation_id and created_by_tool_call_id:
-- those are written by a second statement, which only the service role has the
-- column privilege for, after the conversation is locked and found `ai_active`.
create or replace function public.create_draft_order(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_order_id uuid;
  workspace uuid := (payload ->> 'workspace_id')::uuid;
  v_conversation uuid := (payload ->> 'conversation_id')::uuid;
  item_count integer;
begin
  if v_conversation is not null then
    -- FOR SHARE blocks a concurrent state change until this transaction ends.
    perform 1
    from public.conversations c
    where c.id = v_conversation and c.workspace_id = workspace and c.state = 'ai_active'
    for share;
    if not found then
      raise exception 'ai_not_allowed' using errcode = 'restrict_violation';
    end if;
  end if;

  insert into public.orders (
    workspace_id, seller_id, status, channel, payment_method,
    customer_name, customer_phone, customer_city, customer_email,
    customer_address_line,
    subtotal_amount_minor, shipping_fee_amount_minor, total_amount_minor,
    currency, note, confirmed_at, cancelled_at, created_via
  )
  values (
    workspace,
    (payload ->> 'seller_id')::uuid,
    'draft'::public.order_status,
    coalesce(payload ->> 'channel', 'manual')::public.order_channel,
    coalesce(payload ->> 'payment_method', 'cod')::public.order_payment_method,
    payload ->> 'customer_name',
    payload ->> 'customer_phone',
    payload ->> 'customer_city',
    payload ->> 'customer_email',
    payload ->> 'customer_address_line',
    (payload ->> 'subtotal_amount_minor')::integer,
    coalesce((payload ->> 'shipping_fee_amount_minor')::integer, 0),
    (payload ->> 'total_amount_minor')::integer,
    coalesce(payload ->> 'currency', 'PKR'),
    payload ->> 'note',
    null,
    null,
    coalesce(payload ->> 'created_via', 'manual')
  )
  returning id into new_order_id;

  if v_conversation is not null then
    update public.orders
    set conversation_id = v_conversation,
        created_by_tool_call_id = (payload ->> 'created_by_tool_call_id')::uuid
    where id = new_order_id;
  end if;

  insert into public.order_items (
    order_id, product_id, variant_id, workspace_id, seller_id,
    title, variant_title, sku, quantity,
    unit_price_amount_minor, line_total_amount_minor, currency
  )
  select
    new_order_id,
    (item ->> 'product_id')::uuid,
    (item ->> 'variant_id')::uuid,
    workspace,
    (payload ->> 'seller_id')::uuid,
    item ->> 'title',
    item ->> 'variant_title',
    item ->> 'sku',
    (item ->> 'quantity')::integer,
    (item ->> 'unit_price_amount_minor')::integer,
    (item ->> 'line_total_amount_minor')::integer,
    coalesce(item ->> 'currency', coalesce(payload ->> 'currency', 'PKR'))
  from jsonb_array_elements(coalesce(payload -> 'items', '[]'::jsonb)) as item;

  get diagnostics item_count = row_count;
  if item_count < 1 then
    raise exception 'a draft order must have at least one item'
      using errcode = 'check_violation';
  end if;

  insert into public.order_status_history (
    order_id, workspace_id, seller_id, from_status, to_status, performed_by, note
  )
  values (
    new_order_id,
    workspace,
    (payload ->> 'seller_id')::uuid,
    null,
    'draft'::public.order_status,
    (payload ->> 'performed_by')::uuid,
    case when v_conversation is null then 'Draft order created'
         else 'Draft order created by the WhatsApp AI' end
  );

  return new_order_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- ai_confirm_order: the buyer's second confirmation, enforced here
-- ---------------------------------------------------------------------------

-- Service role only. Under a lock on the conversation and the order it checks:
--   ai_not_allowed            conversation is not ai_active
--   not_found                 order is not this conversation's whatsapp_ai order
--   not_draft                 order already left draft
--   needs_buyer_confirmation  buyer has not answered a delivered AI message sent after the draft
-- then either confirms it (p_auto_confirm: transition_order_status, which
-- deducts stock) or hands the conversation to the seller (waiting_approval).
-- Returns 'confirmed' or 'awaiting_seller'.
-- Stock and history rows are attributed to the shop owner: stock_movements
-- needs a performed_by, and the AI has no auth user.
create or replace function public.ai_confirm_order(
  p_order_id uuid,
  p_conversation_id uuid,
  p_auto_confirm boolean,
  p_handoff_reason text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace uuid;
  v_seller uuid;
  v_state public.conversation_state;
  v_status public.order_status;
  v_created timestamptz;
  v_ai_reply timestamptz;
begin
  select c.workspace_id, c.seller_id, c.state
  into v_workspace, v_seller, v_state
  from public.conversations c
  where c.id = p_conversation_id
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  if v_state <> 'ai_active' then
    raise exception 'ai_not_allowed' using errcode = 'restrict_violation';
  end if;

  select o.status, o.created_at
  into v_status, v_created
  from public.orders o
  where o.id = p_order_id
    and o.workspace_id = v_workspace
    and o.conversation_id = p_conversation_id
    and o.created_via = 'whatsapp_ai'
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  if v_status <> 'draft' then
    raise exception 'not_draft' using errcode = 'check_violation';
  end if;

  -- The buyer must have SEEN the order and answered it: a delivered AI message
  -- after the draft, then a buyer message after that. A message sent while the
  -- draft was still being made (double-send) does not count.
  select min(m.created_at) into v_ai_reply
  from public.messages m
  where m.conversation_id = p_conversation_id
    and m.workspace_id = v_workspace
    and m.direction = 'outbound'
    and m.sender = 'ai'
    and m.status <> 'failed'
    and m.created_at > v_created;

  if v_ai_reply is null or not exists (
    select 1 from public.messages m
    where m.conversation_id = p_conversation_id
      and m.workspace_id = v_workspace
      and m.direction = 'inbound'
      and m.created_at > v_ai_reply
  ) then
    raise exception 'needs_buyer_confirmation' using errcode = 'check_violation';
  end if;

  if p_auto_confirm then
    perform set_config('request.jwt.claim.sub', v_seller::text, true);
    perform public.transition_order_status(
      p_order_id, v_workspace, 'confirmed',
      'Confirmed by the WhatsApp AI after the buyer confirmed twice'
    );
    return 'confirmed';
  end if;

  update public.conversations
  set state = 'waiting_approval', handoff_reason = left(p_handoff_reason, 500)
  where id = p_conversation_id;
  return 'awaiting_seller';
end;
$$;

-- ai_cancel_order_draft: the AI drops its own open draft.
create or replace function public.ai_cancel_order_draft(
  p_order_id uuid,
  p_conversation_id uuid,
  p_note text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace uuid;
  v_state public.conversation_state;
  v_status public.order_status;
begin
  select c.workspace_id, c.state into v_workspace, v_state
  from public.conversations c
  where c.id = p_conversation_id
  for share;
  if not found then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  if v_state <> 'ai_active' then
    raise exception 'ai_not_allowed' using errcode = 'restrict_violation';
  end if;

  select o.status into v_status
  from public.orders o
  where o.id = p_order_id
    and o.workspace_id = v_workspace
    and o.conversation_id = p_conversation_id
    and o.created_via = 'whatsapp_ai'
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  if v_status <> 'draft' then
    raise exception 'not_draft' using errcode = 'check_violation';
  end if;

  perform public.transition_order_status(p_order_id, v_workspace, 'cancelled', left(p_note, 500));
end;
$$;

revoke execute on function public.ai_confirm_order(uuid, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.ai_confirm_order(uuid, uuid, boolean, text) to service_role;
revoke execute on function public.ai_cancel_order_draft(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.ai_cancel_order_draft(uuid, uuid, text) to service_role;

comment on function public.ai_confirm_order(uuid, uuid, boolean, text) is
  'Service role only. Locks the ai_active conversation, requires a delivered AI message after the draft and a buyer message after that, then confirms the draft or moves the conversation to waiting_approval.';
comment on function public.ai_cancel_order_draft(uuid, uuid, text) is
  'Service role only. Cancels the conversation''s own whatsapp_ai draft while the AI still holds the conversation.';
