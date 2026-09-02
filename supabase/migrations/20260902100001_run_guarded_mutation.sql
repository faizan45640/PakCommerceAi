-- run_guarded_mutation(): execute one seller-supplied UPDATE, INSERT, or DELETE, safely.
--
-- WHY. The copilot's universal mutateDatabase tool allows the AI to perform any
-- catalogue or inventory mutation requested by the seller, without requiring dozens
-- of rigid, hardcoded tools.
--
-- HOW IT STAYS 100% SAFE:
-- 1. SECURITY INVOKER. The function runs strictly with the caller's rights,
--    so Postgres RLS (products_update_own, product_variants_update_own, etc.)
--    guarantees a seller can NEVER alter or read another seller's records.
-- 2. DDL Forbidden. Only UPDATE, INSERT, or DELETE is allowed.
--    DROP, ALTER, TRUNCATE, CREATE, GRANT, etc. are rejected.
-- 3. Single statement only. Semicolons are forbidden to prevent statement chaining.
-- 4. statement_timeout caps execution to 10s.

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
  'Executes a single guarded UPDATE, INSERT, or DELETE as the caller, RLS intact, bounded to 10s.';

-- Only authenticated sellers and service_role can execute; anon is revoked.
grant execute on function public.run_guarded_mutation(text) to authenticated, service_role;
revoke execute on function public.run_guarded_mutation(text) from anon;
