-- Baseline: the schema that already existed before migrations were introduced.
--
-- profiles, seller_profiles and workspaces were built by hand in the Supabase
-- dashboard. This file changes nothing on the hosted database - it is marked as
-- already applied there with `supabase migration repair`. Its job is to make a
-- fresh `supabase db reset` produce a database identical to production, so tests
-- run against the real thing rather than an approximation.
--
-- CAPTURED, NOT GUESSED. An earlier version of this file was reconstructed from
-- database.types.ts and was wrong in a dozen ways: it missed every check
-- constraint, all four triggers, two of the three functions, the unique
-- constraints, the column-level grants, and the fact that RLS was already
-- enabled with eight policies. This version is taken from
-- `supabase db dump --linked --schema public` against the live project.
-- See docs/impl-specs/product-catalog/BLOCKERS.md BLK-1.
--
-- KNOWN GAP: handle_new_auth_user() below is called by a trigger on auth.users.
-- That trigger lives in the `auth` schema, which a public-schema dump does not
-- include, so it is not reproduced here. A local database therefore does not
-- auto-create a profile on signup the way production does. Tests create their
-- fixtures explicitly, so nothing depends on it.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.seller_verification_status as enum (
  'pending',
  'verified',
  'rejected',
  'suspended'
);

create type public.workspace_status as enum (
  'active',
  'archived'
);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Keeps updated_at honest. Attached by trigger to every table below, and reused
-- by products and product_variants.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Mirrors a new auth.users row into public.profiles. SECURITY DEFINER because
-- the signing-up user has no rights on profiles yet - which is also why there is
-- no INSERT policy or INSERT grant on profiles for authenticated.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone, avatar_url)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), '')
  );
  return new;
end;
$$;

-- Every seller gets a workspace immediately, so nothing downstream has to handle
-- "seller exists but has nowhere to put products".
create or replace function public.create_default_workspace_for_seller()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.workspaces (seller_id, name, slug, is_default)
  values (new.id, new.business_name, new.slug, true)
  on conflict (seller_id, slug) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid not null,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_length
    check (full_name is null or char_length(full_name) between 2 and 100),
  constraint profiles_phone_length
    check (phone is null or char_length(phone) between 7 and 20)
);

comment on table public.profiles is
  'Personal profile for each authenticated seller. Authentication credentials remain in auth.users.';

create table public.seller_profiles (
  id uuid not null,
  business_name text not null,
  slug text not null,
  description text,
  business_phone text,
  business_email text,
  logo_url text,
  verification_status public.seller_verification_status not null default 'pending',
  verification_notes text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_business_name_length
    check (char_length(business_name) between 2 and 120),
  constraint seller_description_length
    check (description is null or char_length(description) <= 2000),
  constraint seller_phone_length
    check (business_phone is null or char_length(business_phone) between 7 and 20),
  constraint seller_slug_format
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 3 and 80),
  -- verified_at and verification_status can never disagree.
  constraint seller_verified_at_consistency check (
    (verification_status = 'verified' and verified_at is not null)
    or (verification_status <> 'verified' and verified_at is null)
  )
);

comment on table public.seller_profiles is
  'Seller-specific business identity and verification state. One seller profile per authenticated user.';
comment on column public.seller_profiles.verification_status is
  'Controlled by trusted server/admin operations, not directly editable by sellers.';

create table public.workspaces (
  id uuid not null default gen_random_uuid(),
  seller_id uuid not null,
  name text not null,
  slug text not null,
  status public.workspace_status not null default 'active',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  -- The same rule workspaceSchema enforces with superRefine, in the database.
  constraint workspaces_archived_at_matches_status check (
    (status = 'archived' and archived_at is not null)
    or (status <> 'archived' and archived_at is null)
  ),
  constraint workspaces_name_length
    check (char_length(name) between 2 and 120),
  constraint workspaces_slug_format
    check (
      slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      and char_length(slug) >= 3
      and char_length(slug) <= 80
    )
);

comment on table public.workspaces is
  'Tenant workspace owned by a seller. Business resources should belong to one workspace for seller isolation and future multi-store workflows.';
comment on column public.workspaces.seller_id is
  'Owner seller profile. Matches auth.uid() for current one-seller-one-owner model.';
comment on column public.workspaces.is_default is
  'Marks the seller default workspace. A seller may have only one default workspace.';

-- ---------------------------------------------------------------------------
-- Keys, constraints and indexes
-- ---------------------------------------------------------------------------

alter table only public.profiles
  add constraint profiles_pkey primary key (id);

alter table only public.seller_profiles
  add constraint seller_profiles_pkey primary key (id);

alter table only public.seller_profiles
  add constraint seller_profiles_slug_key unique (slug);

alter table only public.workspaces
  add constraint workspaces_pkey primary key (id);

-- Needed by create_default_workspace_for_seller()'s ON CONFLICT clause.
alter table only public.workspaces
  add constraint workspaces_seller_slug_unique unique (seller_id, slug);

create index seller_profiles_verification_status_idx
  on public.seller_profiles using btree (verification_status);

create index workspaces_seller_id_idx
  on public.workspaces using btree (seller_id);

-- At most one default workspace per seller, enforced rather than assumed.
create unique index workspaces_one_default_per_seller_idx
  on public.workspaces using btree (seller_id) where is_default;

-- ---------------------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------------------

-- The identity chain: auth.users -> profiles -> seller_profiles -> workspaces.
-- Because each primary key IS the one above it, auth.uid() resolves directly to
-- a row on all three tables with no lookup.
alter table only public.profiles
  add constraint profiles_id_fkey foreign key (id)
  references auth.users (id) on delete cascade;

alter table only public.seller_profiles
  add constraint seller_profiles_id_fkey foreign key (id)
  references public.profiles (id) on delete cascade;

alter table only public.workspaces
  add constraint workspaces_seller_id_fkey foreign key (seller_id)
  references public.seller_profiles (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace trigger seller_profiles_set_updated_at
  before update on public.seller_profiles
  for each row execute function public.set_updated_at();

create or replace trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

create or replace trigger seller_profiles_create_default_workspace
  after insert on public.seller_profiles
  for each row execute function public.create_default_workspace_for_seller();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.seller_profiles enable row level security;
alter table public.workspaces enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No INSERT policy on profiles: handle_new_auth_user() creates the row as
-- SECURITY DEFINER. No DELETE policy anywhere: rows disappear by cascade when
-- the auth.users row does.

create policy "Users can read their own seller profile"
  on public.seller_profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Users can create their own seller profile"
  on public.seller_profiles for insert to authenticated
  with check (
    (select auth.uid()) = id
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()))
  );

create policy "Sellers can update their own seller profile"
  on public.seller_profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Sellers can read their own workspaces"
  on public.workspaces for select to authenticated
  using ((select auth.uid()) = seller_id);

create policy "Sellers can create their own workspaces"
  on public.workspaces for insert to authenticated
  with check (
    (select auth.uid()) = seller_id
    and exists (select 1 from public.seller_profiles sp where sp.id = (select auth.uid()))
  );

create policy "Sellers can update their own workspaces"
  on public.workspaces for update to authenticated
  using ((select auth.uid()) = seller_id)
  with check ((select auth.uid()) = seller_id);

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- Default privileges: any table later created in this schema by `postgres` is
-- automatically granted to anon, authenticated and service_role. This is
-- Supabase's own configuration, reproduced so a local database behaves like
-- production. It is also why migration 0007 has to REVOKE from anon explicitly -
-- without that, a new table is reachable by logged-out requests by default.
alter default privileges for role postgres in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;

grant usage on schema public to postgres, anon, authenticated, service_role;

-- Revoke before granting. The local Supabase stack configures its own default
-- privileges, which hand anon and authenticated more than production does -
-- TRUNCATE, REFERENCES, TRIGGER and MAINTAIN. TRUNCATE is the one that matters:
-- RLS does not filter it, so a local database would let an authenticated user
-- wipe a table that production protects, and a test asserting otherwise would
-- pass against the wrong thing.
--
-- Starting from revoke makes this file authoritative about privileges instead of
-- dependent on whatever the surrounding environment granted first.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.seller_profiles from anon, authenticated;
revoke all on table public.workspaces from anon, authenticated;

grant all on function public.set_updated_at() to anon, authenticated, service_role;
grant all on function public.create_default_workspace_for_seller() to anon, authenticated, service_role;
revoke all on function public.handle_new_auth_user() from public;
grant all on function public.handle_new_auth_user() to service_role;

-- Column-level grants. A seller may edit their display fields and nothing else -
-- notably not verification_status, which no policy could restrict on its own
-- since policies work per row, not per column.
grant all on table public.profiles to service_role;
grant select on table public.profiles to authenticated;
grant update (full_name, phone, avatar_url) on table public.profiles to authenticated;

grant all on table public.seller_profiles to service_role;
grant select on table public.seller_profiles to authenticated;
grant insert (id, business_name, slug, description, business_phone, business_email, logo_url)
  on table public.seller_profiles to authenticated;
grant update (business_name, slug, description, business_phone, business_email, logo_url)
  on table public.seller_profiles to authenticated;

grant all on table public.workspaces to anon, authenticated, service_role;
