-- adjust_stock(): set a variant's quantity on hand and record the movement,
-- atomically.
--
-- WHY A FUNCTION. Changing stock is two writes - the new quantity on
-- product_variants, and the stock_movements row that says why. supabase-js has
-- no transactions, so done from the API they are two requests, and a failure
-- between them leaves either stock that moved with no record, or a record of a
-- change that never happened. A function body is one statement from the
-- client's point of view: both happen or neither does. Same reasoning as
-- create_product().
--
-- It also closes a race. Two adjustments arriving together would both read
-- "10 on hand" and both record a movement starting from 10. The row is locked
-- (FOR UPDATE) before it is read, so the second waits and starts from the
-- first's result - which is what keeps the movement history a chain where each
-- row begins where the previous one ended.
--
-- THE CALLER STATES A TARGET, NOT A DELTA, as adjustStockInputSchema defines.
-- "Set it to 12" is what a seller counting a shelf knows; the delta is derived
-- here from the locked, current quantity, so it cannot be computed from a stale
-- read.
--
-- GUARDS. Each refusal raises a stable token the API turns into a specific
-- error, rather than a sentence it would have to pattern-match:
--   variant_not_found     - no such variant in that workspace, for this seller
--   stock_not_tracked     - the variant does not track inventory, or has no
--                           starting quantity; untracked variants never produce
--                           movements
--   stock_negative        - the no-negative-stock guard. Refused, never clamped
--                           to zero: a clamp would record a different change
--                           from the one asked for
--   stock_below_reserved  - the target is below the units already promised to
--                           customers
--   stock_unchanged       - the target is the current quantity; a zero-delta
--                           movement is noise in the history
--
-- SECURITY INVOKER, deliberately. The function runs with the caller's rights,
-- so the RLS policies on product_variants and stock_movements apply exactly as
-- they would to direct queries: another seller's variant is invisible to the
-- SELECT below and is reported as not found. SECURITY DEFINER would have made
-- this a way to change anyone's stock.
--
-- search_path is pinned empty and every name is schema-qualified, so a caller
-- cannot redirect these writes at tables of their own.

create function public.adjust_stock(
  p_workspace_id uuid,
  p_variant_id uuid,
  p_target_quantity integer,
  p_reason public.stock_movement_reason,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  variant record;
  new_movement_id uuid;
begin
  if p_target_quantity is null or p_target_quantity < 0 then
    raise exception 'stock_negative'
      using detail = 'Stock cannot be set below zero.';
  end if;

  select v.product_id, v.track_inventory, v.quantity_on_hand, v.reserved_quantity, p.seller_id
    into variant
  from public.product_variants v
  join public.products p on p.id = v.product_id
  where v.id = p_variant_id
    and v.workspace_id = p_workspace_id
  -- Lock the variant only. Locking the product too would make two adjustments
  -- to different sizes of one product wait on each other for nothing.
  for update of v;

  if not found then
    raise exception 'variant_not_found'
      using errcode = 'no_data_found';
  end if;

  if not variant.track_inventory or variant.quantity_on_hand is null then
    raise exception 'stock_not_tracked'
      using detail = 'This variant does not track inventory.';
  end if;

  if p_target_quantity < variant.reserved_quantity then
    raise exception 'stock_below_reserved'
      -- The API shows this number to the seller, so it travels in the detail.
      using detail = variant.reserved_quantity::text;
  end if;

  if p_target_quantity = variant.quantity_on_hand then
    raise exception 'stock_unchanged'
      using detail = variant.quantity_on_hand::text;
  end if;

  update public.product_variants
  set quantity_on_hand = p_target_quantity
  where id = p_variant_id;

  insert into public.stock_movements (
    variant_id, product_id, workspace_id, seller_id, reason,
    quantity_delta, before_quantity_on_hand, after_quantity_on_hand,
    performed_by, note
  )
  values (
    p_variant_id,
    variant.product_id,
    p_workspace_id,
    variant.seller_id,
    p_reason,
    p_target_quantity - variant.quantity_on_hand,
    variant.quantity_on_hand,
    p_target_quantity,
    -- From the session, never from an argument: this column is the audit answer
    -- to "who did this".
    (select auth.uid()),
    nullif(btrim(p_note), '')
  )
  returning id into new_movement_id;

  return new_movement_id;
end;
$$;

comment on function public.adjust_stock(uuid, uuid, integer, public.stock_movement_reason, text) is
  'Sets a variant''s quantity on hand and records the stock movement atomically. Runs as the caller, so RLS applies.';

-- Only signed-in sellers may call it. Functions are executable by PUBLIC by
-- default, and Supabase default privileges grant EXECUTE to anon as well, so
-- both are revoked explicitly - silence is not the same as granting nothing.
-- service_role is left out on purpose: it has no auth.uid(), so it could not
-- fill performed_by, and a movement with nobody behind it is not an audit row.
revoke execute on function public.adjust_stock(uuid, uuid, integer, public.stock_movement_reason, text)
  from public, anon, service_role;
grant execute on function public.adjust_stock(uuid, uuid, integer, public.stock_movement_reason, text)
  to authenticated;
