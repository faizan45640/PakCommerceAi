-- run_readonly_query(): execute one seller-supplied SELECT, safely.
--
-- WHY. The copilot's queryDatabase tool lets the LLM answer questions no
-- structured tool anticipates ("which products were created on Tuesdays?").
-- The model writes the SQL; the database must be the one that refuses to let
-- that SQL do anything but read the caller's own rows.
--
-- HOW IT STAYS SAFE, in order of importance:
--
-- 1. SECURITY INVOKER. The function runs with the caller's rights, so the RLS
--    policies on every table underneath still apply - auth.uid() resolves to
--    the caller and they can only see their own rows. A seller cannot read
--    another seller's data through this function any more than through a
--    direct query.
-- 2. Read-only by construction. The SQL is wrapped as `from (<sql>) t`, so it
--    can only ever be a SELECT-shaped thing inside a subquery; there is no
--    path for a top-level INSERT/UPDATE/DELETE. A trailing semicolon would be
--    the only way to smuggle a second statement, so `;` anywhere is rejected.
-- 3. Keyword blocklist. INSERT/UPDATE/DELETE/DROP/ALTER/... anywhere in the
--    statement fails it outright. Defense in depth, not the whole story - the
--    subquery wrap above is the real guarantee.
-- 4. statement_timeout and a row cap. A runaway query is bounded to 10s and
--    200 rows, so one bad prompt cannot hang a request or flood the response.
-- 5. search_path pinned. `''` would be ideal (nothing resolvable that the
--    caller does not name), but the whole point of this function is to run
--    SQL the model wrote, and that SQL references the tables by their plain
--    names (`from products`). So the path is pinned to `public` — the schema
--    where the seller's tables live — rather than inherited. `pg_temp` and
--    any attacker-controlled schema stay excluded, so the query cannot be
--    redirected at a table the seller did not intend.
--
-- It is a safety *checkpoint*, not a sandbox: the LLM is trusted to write
-- valid SQL and the validator is a regex. The row/time caps and RLS are the
-- guarantees that hold even if the regex is beaten.

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
  -- btrim's default strips only spaces; a leading newline (which both the model
  -- and our own tools routinely produce in template literals) would otherwise
  -- fail the select% check below. Strip all whitespace.
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

  execute format('select coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb) from (%s limit 200) t', p_sql)
    into result;

  return result;
end;
$$;

comment on function public.run_readonly_query(text) is
  'Executes a single read-only SELECT as the caller, RLS intact, bounded to 10s and 200 rows.';

-- Only signed-in sellers may call it. anon is revoked explicitly, matching the
-- pattern set by create_product - Supabase default privileges would otherwise
-- grant EXECUTE to anon the moment the function exists.
grant execute on function public.run_readonly_query(text) to authenticated, service_role;
revoke execute on function public.run_readonly_query(text) from anon;
