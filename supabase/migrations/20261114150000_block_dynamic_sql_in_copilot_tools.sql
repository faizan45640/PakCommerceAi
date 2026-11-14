-- Finish closing the copilot SQL side door (follow-up to 20261114130000).
--
-- The previous guard refused the literal text `set_config`, but Postgres has
-- built-in functions that run SQL given as a string. With them the name can be
-- assembled at runtime, e.g.
--   query_to_xml('select set_con' || 'fig(''request.jwt.claims'', ...)', ...)
-- which could open the order lifecycle gate or, worse, rewrite the JWT claims
-- that auth.uid() and every RLS policy read - letting one seller act as another.
--
-- The built-ins that execute SQL text are a fixed set (checked against
-- pg_proc): query_to_xml, query_to_xmlschema, query_to_xml_and_xmlschema,
-- cursor_to_xml, cursor_to_xmlschema, ts_stat, ts_rewrite(tsquery, text).
-- Together with set_config itself and our own two runners (which run SQL text
-- too), they are refused by name in both runners. Identifiers can only be
-- spelled plainly, quoted (still matched) or with U& escapes (refused), so
-- the name cannot be disguised.
--
-- run_readonly_query keeps its read-only transaction (20261114130000).

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

  -- Functions that run SQL from a string (or set session settings) would let
  -- the text check above be bypassed, so they are refused by name.
  if p_sql ~* '\y(set_config|query_to_xml\w*|query_to_xmlschema|cursor_to_xml\w*|ts_stat|ts_rewrite|run_readonly_query|run_guarded_mutation|transition_order_status)\y' or p_sql ~* 'u&\s*[''"]' then
    raise exception 'query contains a forbidden function or escape' using errcode = 'check_violation';
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

  -- Session settings carry the seller's identity (request.jwt.claims, which RLS
  -- reads) and the order lifecycle gate. Seller SQL must never reach set_config,
  -- directly or through a function that runs SQL from a string, nor call the
  -- lifecycle function itself.
  if clean_sql ~* '\y(set_config|query_to_xml\w*|query_to_xmlschema|cursor_to_xml\w*|ts_stat|ts_rewrite|run_readonly_query|run_guarded_mutation|transition_order_status)\y' or clean_sql ~* 'u&\s*[''"]' then
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
