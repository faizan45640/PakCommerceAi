-- Stop the copilot's mutateDatabase tool from editing orders or stock.
--
-- Orders must be created through createDraftOrder (server-side prices) and
-- moved through transition_order_status (stock + history). Stock must change
-- through adjust_stock so every change leaves a stock_movements row. Until now
-- only the copilot prompt said so: run_guarded_mutation could still insert a
-- draft order with made-up prices, edit draft lines, or set quantity_on_hand
-- with no movement.
--
-- run_guarded_mutation now sets pakcommerce.copilot_mutation = 'on' while it
-- runs the seller's statement. Since 20261114150000 seller SQL cannot reach
-- set_config, so the flag cannot be faked or cleared, and these triggers can
-- trust it:
--   orders, order_items, order_status_history, stock_movements - any write refused
--   product_variants - changing quantity_on_hand / reserved_quantity refused
-- Every other path (REST API, create_draft_order, transition_order_status,
-- adjust_stock, the typed copilot tools) runs without the flag and is unchanged.
--
-- Also revokes EXECUTE on both runners from PUBLIC (Postgres grants it to
-- PUBLIC by default; earlier migrations only revoked anon).

create or replace function public.run_guarded_mutation(p_sql text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  normalized text;
  affected_count integer;
  clean_sql text;
begin
  -- Strip leading/trailing whitespace and trailing semicolons
  clean_sql := btrim(p_sql, E' \t\n\r;');
  normalized := lower(clean_sql);

  if normalized = '' then
    raise exception 'empty query' using errcode = 'check_violation';
  end if;

  -- Ensure it starts with UPDATE, INSERT, or DELETE
  if not (normalized like 'update%' or normalized like 'insert%' or normalized like 'delete%') then
    raise exception 'only UPDATE, INSERT, or DELETE mutations are allowed' using errcode = 'check_violation';
  end if;

  -- Semicolons inside the query are forbidden to prevent statement chaining
  if clean_sql ~ ';' then
    raise exception 'only a single statement is allowed; semicolons are forbidden'
      using errcode = 'check_violation';
  end if;

  -- Strict keyword blocklist against DDL and system commands
  if clean_sql ~* '\y(drop|alter|truncate|grant|revoke|create|replace|copy|vacuum|analyze|do|call|execute|comment|listen|notify|pg_sleep)\y' then
    raise exception 'query contains a forbidden DDL or system keyword' using errcode = 'check_violation';
  end if;

  -- Session settings carry the seller's identity (request.jwt.claims, which RLS
  -- reads) and the order lifecycle gate. Seller SQL must never reach set_config,
  -- directly or through a function that runs SQL from a string, nor call the
  -- lifecycle function itself.
  if clean_sql ~* '\y(set_config|query_to_xml\w*|query_to_xmlschema|cursor_to_xml\w*|ts_stat|ts_rewrite|run_readonly_query|run_guarded_mutation|transition_order_status)\y' or clean_sql ~* 'u&\s*[''"]' then
    raise exception 'query contains a forbidden function or escape' using errcode = 'check_violation';
  end if;

  perform set_config('statement_timeout', '10000', true);
  -- Marks writes made by this statement so the triggers below can refuse the
  -- tables the copilot must not edit. Seller SQL cannot reach set_config (see
  -- the check above), so it cannot switch this off.
  perform set_config('pakcommerce.copilot_mutation', 'on', true);

  execute clean_sql;
  get diagnostics affected_count = row_count;

  perform set_config('pakcommerce.copilot_mutation', 'off', true);

  return jsonb_build_object(
    'status', 'success',
    'rows_affected', affected_count
  );
end;
$$;

comment on function public.run_guarded_mutation(text) is
  'Executes a single guarded UPDATE, INSERT, or DELETE as the caller, RLS intact, bounded to 10s. Cannot touch session settings, orders or stock.';

create or replace function public.refuse_copilot_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('pakcommerce.copilot_mutation', true), '') = 'on' then
    raise exception
      'copilot_mutation_refused: % cannot be changed through mutateDatabase', tg_table_name
      using errcode = 'insufficient_privilege',
            hint = 'Use createDraftOrder for new orders, the Orders page to confirm or cancel, and updateProductStock for stock.';
  end if;
  return null;
end;
$$;

create or replace function public.refuse_copilot_stock_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('pakcommerce.copilot_mutation', true), '') = 'on'
     and (
       (tg_op = 'INSERT' and (coalesce(new.quantity_on_hand, 0) <> 0 or new.reserved_quantity <> 0))
       or (tg_op = 'UPDATE' and (
         new.quantity_on_hand is distinct from old.quantity_on_hand
         or new.reserved_quantity is distinct from old.reserved_quantity
       ))
     ) then
    raise exception
      'copilot_mutation_refused: stock cannot be changed through mutateDatabase'
      using errcode = 'insufficient_privilege',
            hint = 'Use updateProductStock, which records a stock movement.';
  end if;
  return new;
end;
$$;

revoke all on function public.refuse_copilot_mutation() from public, anon, authenticated;
revoke all on function public.refuse_copilot_stock_change() from public, anon, authenticated;

create trigger orders_refuse_copilot_mutation
  before insert or update or delete on public.orders
  for each statement execute function public.refuse_copilot_mutation();

create trigger order_items_refuse_copilot_mutation
  before insert or update or delete on public.order_items
  for each statement execute function public.refuse_copilot_mutation();

create trigger order_status_history_refuse_copilot_mutation
  before insert or update or delete on public.order_status_history
  for each statement execute function public.refuse_copilot_mutation();

create trigger stock_movements_refuse_copilot_mutation
  before insert or update or delete on public.stock_movements
  for each statement execute function public.refuse_copilot_mutation();

create trigger product_variants_refuse_copilot_stock_change
  before insert or update on public.product_variants
  for each row execute function public.refuse_copilot_stock_change();

revoke execute on function public.run_readonly_query(text) from public, anon;
revoke execute on function public.run_guarded_mutation(text) from public, anon;
grant execute on function public.run_readonly_query(text) to authenticated, service_role;
grant execute on function public.run_guarded_mutation(text) to authenticated, service_role;
