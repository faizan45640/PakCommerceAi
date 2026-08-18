-- Access control for the identity tables: profiles, seller_profiles, workspaces.
--
-- These three predate the decision to use RLS (Open Decision #4, answered by
-- T-020), so until now any authenticated user could read every seller's business
-- name, phone number and workspace list. Nothing in the application queried them
-- yet, which is why it had not surfaced - and why this is the cheapest possible
-- moment to close it, before any code depends on the permissive behaviour.
--
-- Identity chain: seller_profiles.id IS profiles.id IS auth.users.id, so
-- auth.uid() resolves directly to a row on all three tables with no lookup.
--
-- IDEMPOTENT ON PURPOSE. The hosted database may already have RLS enabled and
-- policies created through the Supabase dashboard - the generated types file, the
-- only record of that schema in this repo, does not record policies either way
-- (BLK-1). `enable row level security` is safe to repeat, and each policy is
-- dropped before being created so this migration converges to a known state
-- whatever it finds.
--
-- WARNING for whoever runs `db push`: this only replaces policies with OUR names.
-- A pre-existing policy under a different name (the dashboard generates names
-- like "Enable read access for all users") would remain, and permissive policies
-- are OR-ed together - one of those could widen access past what is written here.
-- Run `supabase db diff --linked` first and review anything unexpected.

alter table public.profiles enable row level security;
alter table public.seller_profiles enable row level security;
alter table public.workspaces enable row level security;

-- ---------------------------------------------------------------------------
-- profiles - a user may only ever see and edit their own row.
-- ---------------------------------------------------------------------------

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

-- Signup writes this row. If a SECURITY DEFINER trigger on auth.users creates it
-- instead, that path bypasses RLS and is unaffected by this policy.
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No delete policy. A profile disappears when its auth.users row does, by
-- cascade. Deleting an account is a server-side operation, not something a
-- client should be able to do with one request.

-- ---------------------------------------------------------------------------
-- seller_profiles - the seller's business identity. Private, not a storefront.
-- ---------------------------------------------------------------------------

-- PakCommerce AI is an operations layer, not a marketplace: nothing here is
-- meant to be publicly browsable, so there is no policy granting anyone else
-- read access.

drop policy if exists seller_profiles_select_own on public.seller_profiles;
create policy seller_profiles_select_own
  on public.seller_profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists seller_profiles_insert_own on public.seller_profiles;
create policy seller_profiles_insert_own
  on public.seller_profiles for insert to authenticated
  with check (id = (select auth.uid()));

-- verification_status is deliberately writable by the seller here. It should not
-- be - only an admin should move a seller to 'verified' - but restricting a
-- single column needs either a column grant or a trigger, and doing that
-- properly belongs with the verification feature, which does not exist yet.
-- Recorded rather than left silent.
drop policy if exists seller_profiles_update_own on public.seller_profiles;
create policy seller_profiles_update_own
  on public.seller_profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- workspaces - the tenancy root. Everything else hangs off this.
-- ---------------------------------------------------------------------------

drop policy if exists workspaces_select_own on public.workspaces;
create policy workspaces_select_own
  on public.workspaces for select to authenticated
  using (seller_id = (select auth.uid()));

drop policy if exists workspaces_insert_own on public.workspaces;
create policy workspaces_insert_own
  on public.workspaces for insert to authenticated
  with check (seller_id = (select auth.uid()));

-- WITH CHECK matters more here than anywhere else: without it a seller could
-- edit their own workspace and hand it to someone else, taking its entire
-- product catalogue with it.
drop policy if exists workspaces_update_own on public.workspaces;
create policy workspaces_update_own
  on public.workspaces for update to authenticated
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));

-- No delete policy, deliberately. Deleting a workspace cascades to every product
-- and variant in it, and the workspace contract already models retirement as
-- `status = 'archived'` with an archived_at timestamp. Archiving is reversible
-- and auditable; a hard delete from a client request is neither. Server-side
-- code holding the service-role key can still do it when a seller genuinely
-- asks to erase their data.
