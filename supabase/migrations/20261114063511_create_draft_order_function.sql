-- create_draft_order(): insert a draft order, its line items, and the initial
-- status-history row atomically.
--
-- WHY A FUNCTION. supabase-js has no transactions. Creating a draft is three
-- inserts (order, items, history). If the second or third fails, the first has
-- already committed and leaves an order that the shared contract rejects
-- (items.min(1)) or that has no audit trail.
--
-- SECURITY INVOKER so RLS still applies. seller_id comes from the payload but
-- the insert policy requires seller_id = auth.uid(), so a caller cannot invent
-- another seller's draft.
--
-- This function does NOT touch stock. Drafts never reserve or deduct inventory
-- (packages/shared/src/orders/README.md). Confirmation is T-037.

create or replace function public.create_draft_order(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_order_id uuid;
  workspace uuid := (payload ->> 'workspace_id')::uuid;
  item_count integer;
begin
  insert into public.orders (
    workspace_id, seller_id, status, channel, payment_method,
    customer_name, customer_phone, customer_city, customer_email,
    customer_address_line,
    subtotal_amount_minor, shipping_fee_amount_minor, total_amount_minor,
    currency, note, confirmed_at, cancelled_at
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
    null
  )
  returning id into new_order_id;

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
    'Draft order created'
  );

  return new_order_id;
end;
$$;

comment on function public.create_draft_order(jsonb) is
  'Inserts a draft order, its items, and the initial status-history row atomically. Runs as the caller, so RLS applies. Does not touch stock.';

grant execute on function public.create_draft_order(jsonb) to authenticated, service_role;
revoke execute on function public.create_draft_order(jsonb) from anon;
