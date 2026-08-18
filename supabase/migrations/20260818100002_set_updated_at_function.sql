-- Shared trigger function: keeps updated_at honest.
--
-- Every domain table carries updated_at, and application code cannot be trusted
-- to set it on every path (a sync job, a SQL fix, an admin client). Doing it in
-- the database means the column is always true.
--
-- Lives in its own migration because it is shared infrastructure: the product
-- tables use it, and every table added after this one will too.
--
-- search_path is pinned to empty so the function cannot be hijacked by a
-- caller-controlled search_path.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Sets updated_at to now() on UPDATE. Attach with a before-update row trigger.';
