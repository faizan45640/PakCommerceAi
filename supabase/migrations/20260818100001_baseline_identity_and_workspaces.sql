-- Baseline: the schema that already existed before migrations were introduced.
--
-- The three tables below (profiles, seller_profiles, workspaces) were created by
-- hand in the Supabase dashboard. This file does not change the database; it
-- records what is already there so that `supabase db reset` reproduces the real
-- schema from source. Everything after this migration is additive.
--
-- Reconstructed from packages/integrations/src/supabase/database.types.ts, which
-- is authoritative for columns, types, enums and foreign keys — but NOT for
-- defaults, indexes, triggers or RLS. Verify against the live project with
-- `supabase db diff --linked` before trusting it.
-- See docs/impl-specs/product-catalog/BLOCKERS.md BLK-1.

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

-- One row per authenticated user. Mirrors auth.users with app-owned fields.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A profile that sells. The primary key IS the profile id, so a user has at
-- most one seller identity and auth.uid() resolves directly to a seller.
create table public.seller_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  business_name text not null,
  slug text not null unique,
  business_email text,
  business_phone text,
  description text,
  logo_url text,
  verification_status public.seller_verification_status not null default 'pending',
  verification_notes text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The isolated environment a seller manages their business in. Every
-- business resource hangs off a workspace.
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.seller_profiles (id) on delete cascade,
  name text not null,
  slug text not null,
  status public.workspace_status not null default 'active',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index workspaces_seller_id_idx on public.workspaces (seller_id);

-- Table privileges.
--
-- Tables created through the Supabase dashboard are granted to the API roles
-- automatically. Tables created by a migration are not, so a fresh
-- `supabase db reset` would produce tables that PostgREST cannot read at all.
-- Granting here keeps a rebuilt database equivalent to the hosted one.
--
-- These three tables have no RLS policies yet - they predate that decision - so
-- they are reachable by any authenticated user. That is the behaviour today, not
-- an endorsement of it. See docs/impl-specs/product-catalog/DESIGN-INTENT.md.

grant select, insert, update, delete on public.profiles to authenticated, service_role;
grant select, insert, update, delete on public.seller_profiles to authenticated, service_role;
grant select, insert, update, delete on public.workspaces to authenticated, service_role;
