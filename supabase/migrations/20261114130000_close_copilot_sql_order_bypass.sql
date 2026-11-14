-- Close two ways the copilot's SQL tools could change orders outside the lifecycle.
--
-- 1. run_readonly_query only checked the text. It never made the transaction
--    read-only, so `select transition_order_status(...)` (or any other writing
--    function) passed the keyword list and wrote. queryDatabase needs no seller
--    approval, so this let a read tool confirm or cancel orders.
--    Fix: switch the transaction to read-only before running the seller's SQL.
--    Postgres then refuses every write, including writes inside called
--    functions, and a read-only transaction cannot be switched back to
--    read-write once it has run a query.
--
-- 2. run_guarded_mutation did not block set_config. The order lifecycle
--    triggers trust the transaction-local setting
--    pakcommerce.allow_order_lifecycle_change, so a single statement such as
--      update orders set status = 'confirmed', ...
--      from (select set_config('pakcommerce.allow_order_lifecycle_change', 'on', true)) g ...
--    could open the gate and confirm an order with no stock deduction and no
--    history row.
--    Fix: also forbid set_config, U& unicode-escape identifiers/strings (which
--    could spell set_config without the literal text), and direct calls to
--    transition_order_status. Status changes go through the order API only.

create or replace function public.run_readonly_query(p_sql text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  normalized text;
  result jsonb;
begin
  normalized := lower(btrim(p_sql, E' \t\n\r'));

  if normalized = '' then
    raise exception 'empty query' using errcode = 'check_violation';
  end if;

  if not (normalized like 'select%' or normalized like 'with%') then
    raise exception 'only SELECT or WITH queries are allowed' using errcode = 'check_violation';
  end if;

  if p_sql ~ ';' then
    raise exception 'only a single statement is allowed; the query must not contain semicolons'
      using errcode = 'check_violation';
  end if;

  if p_sql ~* '\y(insert|update|delete|drop|alter|truncate|grant|revoke|create|replace|copy|vacuum|analyze|set|reset|do|call|execute|comment|listen|notify|merge|upsert)\y' then
    raise exception 'query contains a forbidden keyword' using errcode = 'check_violation';
  end if;

  perform set_config('statement_timeout', '10000', true);
  -- The real guarantee: nothing below can write, whatever the text says.
  perform set_config('transaction_read_only', 'on', true);

  execute format('select coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb) from (%s limit 200) t', p_sql)
    into result;

  return result;
end;
$$;

comment on function public.run_readonly_query(text) is
  'Runs one seller-supplied SELECT as the caller in a read-only transaction, RLS intact, bounded to 10s and 200 rows.';

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

  -- Session settings gate the order lifecycle; seller SQL must never touch them,
  -- nor call the lifecycle function directly.
  if clean_sql ~* '\y(set_config|transition_order_status)\y' or clean_sql ~* 'u&\s*[''"]' then
    raise exception 'query contains a forbidden function or escape' using errcode = 'check_violation';
  end if;

  perform set_config('statement_timeout', '10000', true);

  execute clean_sql;
  get diagnostics affected_count = row_count;

  return jsonb_build_object(
    'status', 'success',
    'rows_affected', affected_count
  );
end;
$$;

comment on function public.run_guarded_mutation(text) is
  'Executes a single guarded UPDATE, INSERT, or DELETE as the caller, RLS intact, bounded to 10s. Cannot touch session settings or order status.';

grant execute on function public.run_readonly_query(text) to authenticated, service_role;
revoke execute on function public.run_readonly_query(text) from anon;
grant execute on function public.run_guarded_mutation(text) to authenticated, service_role;
revoke execute on function public.run_guarded_mutation(text) from anon;
