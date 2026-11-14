-- T-037: draft → confirmed deducts stock atomically with the status change.
--
-- WHY HERE. Confirmation is the stock event (packages/shared inventory + orders
-- contracts). supabase-js has no multi-statement transactions, so status,
-- history, quantity_on_hand, and the sale movement must share one function
-- body — same pattern as create_draft_order / adjust_stock.
--
-- GUARDS (stable tokens for the API):
--   address_required   - confirmed-path orders need a delivery address
--   insufficient_stock - available (on_hand - reserved) < ordered qty
--   stock_negative     - would drive on_hand below zero (should not fire if
--                        available was checked, but kept as a hard stop)
--
-- Untracked variants (track_inventory false or null on_hand) are skipped:
-- selling them does not consume stock (inventory contract).
--
-- Ship / return / cancel-from-confirmed stay refused; only draft→cancelled
-- and draft→confirmed are enabled.

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
  v_address text;
  history_id uuid;
  line record;
  variant record;
  available integer;
  new_on_hand integer;
begin
  select status, seller_id, customer_address_line
  into current_status, v_seller_id, v_address
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

  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'note must be at most 500 characters'
      using errcode = 'check_violation';
  end if;

  -- Only draft → cancelled | confirmed for now.
  if not (
    current_status = 'draft'
    and p_to_status in ('cancelled', 'confirmed')
  ) then
    raise exception
      'only draft → cancelled|confirmed is enabled; fulfillment transitions come later'
      using errcode = 'feature_not_supported';
  end if;

  if p_to_status = 'confirmed' then
    if v_address is null or btrim(v_address) = '' then
      raise exception 'address_required'
        using detail = 'A delivery address is required to confirm an order.';
    end if;

    -- Aggregate lines per variant so two lines of the same SKU lock once.
    for line in
      select
        oi.variant_id,
        sum(oi.quantity)::integer as quantity
      from public.order_items oi
      where oi.order_id = p_order_id
      group by oi.variant_id
    loop
      select
        v.id,
        v.product_id,
        v.track_inventory,
        v.quantity_on_hand,
        v.reserved_quantity
      into variant
      from public.product_variants v
      where v.id = line.variant_id
        and v.workspace_id = p_workspace_id
      for update of v;

      if not found then
        raise exception 'variant_not_found'
          using errcode = 'no_data_found',
                detail = line.variant_id::text;
      end if;

      -- Untracked: no stock check, no movement.
      if not variant.track_inventory or variant.quantity_on_hand is null then
        continue;
      end if;

      available := variant.quantity_on_hand - variant.reserved_quantity;
      if available < line.quantity then
        raise exception 'insufficient_stock'
          using detail = format(
            '%s:%s:%s',
            line.variant_id::text,
            available::text,
            line.quantity::text
          );
      end if;

      new_on_hand := variant.quantity_on_hand - line.quantity;
      if new_on_hand < 0 then
        raise exception 'stock_negative'
          using detail = 'Stock cannot go below zero.';
      end if;
      if new_on_hand < variant.reserved_quantity then
        raise exception 'stock_below_reserved'
          using detail = variant.reserved_quantity::text;
      end if;

      update public.product_variants
      set quantity_on_hand = new_on_hand
      where id = line.variant_id;

      insert into public.stock_movements (
        variant_id, product_id, workspace_id, seller_id, reason,
        quantity_delta, before_quantity_on_hand, after_quantity_on_hand,
        performed_by, note
      )
      values (
        line.variant_id,
        variant.product_id,
        p_workspace_id,
        v_seller_id,
        'sale'::public.stock_movement_reason,
        -line.quantity,
        variant.quantity_on_hand,
        new_on_hand,
        (select auth.uid()),
        format('Order %s confirmed', p_order_id::text)
      );
    end loop;
  end if;

  perform set_config('pakcommerce.allow_order_lifecycle_change', 'on', true);

  if p_to_status = 'cancelled' then
    update public.orders
    set
      status = 'cancelled',
      cancelled_at = clock_timestamp()
    where id = p_order_id;
  else
    -- confirmed
    update public.orders
    set
      status = 'confirmed',
      confirmed_at = clock_timestamp()
    where id = p_order_id;
  end if;

  insert into public.order_status_history (
    order_id, workspace_id, seller_id, from_status, to_status, performed_by, note
  )
  values (
    p_order_id,
    p_workspace_id,
    v_seller_id,
    current_status,
    p_to_status,
    auth.uid(),
    p_note
  )
  returning id into history_id;

  return history_id;
end;
$$;

comment on function public.transition_order_status(uuid, uuid, public.order_status, text) is
  'Atomic status change + history. draft→cancelled, or draft→confirmed with sale stock deduction.';

grant execute on function public.transition_order_status(uuid, uuid, public.order_status, text)
  to authenticated, service_role;
revoke execute on function public.transition_order_status(uuid, uuid, public.order_status, text)
  from anon;
