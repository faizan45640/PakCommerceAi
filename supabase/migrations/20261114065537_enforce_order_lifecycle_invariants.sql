-- Close the order lifecycle holes left after T-035 / T-036:
--
-- 1. Status / confirmed_at / cancelled_at cannot change via raw UPDATE.
--    Only transition_order_status may flip them (session GUC gate).
-- 2. Non-draft orders cannot be INSERTed without that same gate.
-- 3. History transition rows (from_status not null) require the gate, so
--    orphan history cannot drift from orders.status.
-- 4. Until T-037, transition_order_status only allows draft → cancelled.
--    Confirmation / fulfillment cannot bypass stock by writing SQL.
-- 5. Line items are frozen once an order leaves draft; non-draft orders
--    cannot be deleted.
-- 6. Currency is PKR-only (matches shared moneySchema).
-- 7. Deferred check: every committed order has ≥1 item and
--    subtotal = sum(line totals).

-- ---------------------------------------------------------------------------
-- PKR-only money
-- ---------------------------------------------------------------------------

alter table public.orders
  drop constraint orders_currency_iso;

alter table public.orders
  add constraint orders_currency_pkr check (currency = 'PKR');

alter table public.order_items
  drop constraint order_items_currency_iso;

alter table public.order_items
  add constraint order_items_currency_pkr check (currency = 'PKR');

-- ---------------------------------------------------------------------------
-- Session gate helpers
-- ---------------------------------------------------------------------------

create or replace function public.order_lifecycle_change_allowed()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('pakcommerce.allow_order_lifecycle_change', true), ''),
    'off'
  ) = 'on';
$$;

comment on function public.order_lifecycle_change_allowed() is
  'True when transition_order_status (or a test fixture) has opened the lifecycle gate.';

revoke all on function public.order_lifecycle_change_allowed() from public, anon;
grant execute on function public.order_lifecycle_change_allowed() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- orders: block raw lifecycle writes
-- ---------------------------------------------------------------------------

create or replace function public.enforce_order_lifecycle_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' and not public.order_lifecycle_change_allowed() then
      raise exception
        'orders may only be inserted as draft; use transition_order_status for later statuses'
        using errcode = 'restrict_violation';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if (
      old.status is distinct from new.status
      or old.confirmed_at is distinct from new.confirmed_at
      or old.cancelled_at is distinct from new.cancelled_at
    ) and not public.order_lifecycle_change_allowed() then
      raise exception
        'order status changes must go through transition_order_status'
        using errcode = 'restrict_violation';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception
        'only draft orders can be deleted; cancel or transition instead'
        using errcode = 'restrict_violation';
    end if;
    return old;
  end if;

  return null;
end;
$$;

comment on function public.enforce_order_lifecycle_write() is
  'Keeps order lifecycle fields and deletes under transition_order_status / draft-only rules.';

revoke all on function public.enforce_order_lifecycle_write() from public, anon, authenticated;

create trigger orders_enforce_lifecycle_insert
  before insert on public.orders
  for each row
  execute function public.enforce_order_lifecycle_write();

create trigger orders_enforce_lifecycle_update
  before update on public.orders
  for each row
  execute function public.enforce_order_lifecycle_write();

create trigger orders_enforce_lifecycle_delete
  before delete on public.orders
  for each row
  execute function public.enforce_order_lifecycle_write();

-- ---------------------------------------------------------------------------
-- order_status_history: transition rows only via the gate
-- ---------------------------------------------------------------------------

create or replace function public.enforce_order_status_history_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Initial create-as-draft rows stay open for create_draft_order.
  if new.from_status is null then
    return new;
  end if;

  if not public.order_lifecycle_change_allowed() then
    raise exception
      'order status history transitions must go through transition_order_status'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

comment on function public.enforce_order_status_history_insert() is
  'Allows null→draft history freely; every other history row needs the lifecycle gate.';

revoke all on function public.enforce_order_status_history_insert()
  from public, anon, authenticated;

create trigger order_status_history_enforce_insert
  before insert on public.order_status_history
  for each row
  execute function public.enforce_order_status_history_insert();

-- ---------------------------------------------------------------------------
-- order_items: freeze after leaving draft; keep header money honest
-- ---------------------------------------------------------------------------

create or replace function public.enforce_order_item_mutable_only_on_draft()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_order_id uuid;
  order_status public.order_status;
begin
  target_order_id := coalesce(new.order_id, old.order_id);

  select status into order_status
  from public.orders
  where id = target_order_id;

  -- Cascade delete of a draft order removes items while the parent still exists.
  if order_status is null then
    return coalesce(new, old);
  end if;

  if order_status <> 'draft' then
    raise exception
      'order line items are frozen after the order leaves draft'
      using errcode = 'restrict_violation';
  end if;

  return coalesce(new, old);
end;
$$;

comment on function public.enforce_order_item_mutable_only_on_draft() is
  'Rejects insert/update/delete on order_items once the parent order is non-draft.';

revoke all on function public.enforce_order_item_mutable_only_on_draft()
  from public, anon, authenticated;

create trigger order_items_mutable_only_on_draft
  before insert or update or delete on public.order_items
  for each row
  execute function public.enforce_order_item_mutable_only_on_draft();

create or replace function public.enforce_order_line_money_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_order_id uuid;
  header_subtotal integer;
  lines_subtotal integer;
  line_count integer;
begin
  target_order_id := coalesce(new.order_id, old.order_id);

  select o.subtotal_amount_minor, coalesce(sum(i.line_total_amount_minor), 0), count(i.id)
  into header_subtotal, lines_subtotal, line_count
  from public.orders o
  left join public.order_items i on i.order_id = o.id
  where o.id = target_order_id
  group by o.subtotal_amount_minor;

  -- Order already deleted (cascade) — nothing to enforce.
  if header_subtotal is null then
    return coalesce(new, old);
  end if;

  if line_count < 1 then
    raise exception
      'a committed order must have at least one line item'
      using errcode = 'check_violation';
  end if;

  if header_subtotal is distinct from lines_subtotal then
    raise exception
      'order subtotal_amount_minor (%) must equal the sum of line totals (%)',
      header_subtotal, lines_subtotal
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

comment on function public.enforce_order_line_money_integrity() is
  'Deferred: every committed order has ≥1 item and subtotal = sum(line totals).';

revoke all on function public.enforce_order_line_money_integrity()
  from public, anon, authenticated;

-- DEFERRABLE so create_draft_order can insert the header before its lines.
create constraint trigger order_items_money_integrity
  after insert or update or delete on public.order_items
  deferrable initially deferred
  for each row
  execute function public.enforce_order_line_money_integrity();

create or replace function public.enforce_order_header_money_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  lines_subtotal integer;
  line_count integer;
begin
  if tg_op = 'UPDATE'
     and old.subtotal_amount_minor is not distinct from new.subtotal_amount_minor
     and old.shipping_fee_amount_minor is not distinct from new.shipping_fee_amount_minor
     and old.total_amount_minor is not distinct from new.total_amount_minor then
    return new;
  end if;

  select coalesce(sum(line_total_amount_minor), 0), count(*)
  into lines_subtotal, line_count
  from public.order_items
  where order_id = new.id;

  -- Deferred: create_draft_order inserts the header before lines in one
  -- transaction; at COMMIT the lines are already present.
  if line_count < 1 then
    raise exception
      'a committed order must have at least one line item'
      using errcode = 'check_violation';
  end if;

  if new.subtotal_amount_minor is distinct from lines_subtotal then
    raise exception
      'order subtotal_amount_minor (%) must equal the sum of line totals (%)',
      new.subtotal_amount_minor, lines_subtotal
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.enforce_order_header_money_integrity() is
  'Deferred: when lines exist, header subtotal must match them.';

revoke all on function public.enforce_order_header_money_integrity()
  from public, anon, authenticated;

create constraint trigger orders_header_money_integrity
  after insert or update on public.orders
  deferrable initially deferred
  for each row
  execute function public.enforce_order_header_money_integrity();

-- ---------------------------------------------------------------------------
-- Controlled transition RPC (cancel-only until T-037)
-- ---------------------------------------------------------------------------

create or replace function public.transition_order_status(
  p_order_id uuid,
  p_workspace_id uuid,
  p_to_status public.order_status,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_status public.order_status;
  v_seller_id uuid;
  history_id uuid;
begin
  select status, seller_id
  into current_status, v_seller_id
  from public.orders
  where id = p_order_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'order not found' using errcode = 'no_data_found';
  end if;

  if not public.is_allowed_order_status_transition(current_status, p_to_status) then
    raise exception
      'illegal order status transition: % → %', current_status, p_to_status
      using errcode = 'check_violation';
  end if;

  -- Confirmation is the stock event. Until T-037 wires reservation into this
  -- function, refuse every transition except draft → cancelled.
  if not (current_status = 'draft' and p_to_status = 'cancelled') then
    raise exception
      'only draft → cancelled is enabled until confirmation/stock (T-037) lands'
      using errcode = 'feature_not_supported';
  end if;

  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'note must be at most 500 characters'
      using errcode = 'check_violation';
  end if;

  perform set_config('pakcommerce.allow_order_lifecycle_change', 'on', true);

  update public.orders
  set
    status = 'cancelled',
    cancelled_at = clock_timestamp()
  where id = p_order_id;

  insert into public.order_status_history (
    order_id, workspace_id, seller_id, from_status, to_status, performed_by, note
  )
  values (
    p_order_id,
    p_workspace_id,
    v_seller_id,
    current_status,
    'cancelled',
    auth.uid(),
    p_note
  )
  returning id into history_id;

  return history_id;
end;
$$;

comment on function public.transition_order_status(uuid, uuid, public.order_status, text) is
  'Atomic status change + history row. Only draft→cancelled until T-037 adds stock.';

grant execute on function public.transition_order_status(uuid, uuid, public.order_status, text)
  to authenticated, service_role;
revoke execute on function public.transition_order_status(uuid, uuid, public.order_status, text)
  from anon;
