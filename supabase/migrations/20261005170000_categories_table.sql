-- Categories & Subcategories table for hierarchical catalog organization
-- and multi-channel category mapping (Daraz, Shopify, WooCommerce, Google Shopping).

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  seller_id uuid not null references auth.users (id) on delete cascade,
  parent_id uuid references public.categories (id) on delete cascade,

  name text not null,
  slug text not null,
  description text,

  -- Channel category taxonomy mappings for external marketplace synchronization:
  -- e.g. { "daraz_category_id": 1234, "shopify_product_type": "Kurtas", "google_product_category": "Apparel & Accessories > Clothing" }
  channel_mappings jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint categories_workspace_slug_key unique (workspace_id, slug),
  constraint categories_name_not_blank check (btrim(name) <> ''),
  constraint categories_name_max_length check (char_length(name) <= 120),
  constraint categories_slug_length check (char_length(slug) between 1 and 150),
  constraint categories_channel_mappings_is_object check (jsonb_typeof(channel_mappings) = 'object')
);

create index if not exists categories_workspace_parent_idx
  on public.categories (workspace_id, parent_id);

create index if not exists categories_workspace_seller_idx
  on public.categories (workspace_id, seller_id);

create trigger categories_set_updated_at
  before update on public.categories
  for each row
  execute function public.set_updated_at();

-- Access control: table privileges & RLS policies
grant select, insert, update, delete on public.categories to authenticated, service_role;
revoke all on public.categories from anon;

alter table public.categories enable row level security;

create policy categories_select_own
  on public.categories for select to authenticated
  using (seller_id = (select auth.uid()));

create policy categories_insert_own
  on public.categories for insert to authenticated
  with check (seller_id = (select auth.uid()));

create policy categories_update_own
  on public.categories for update to authenticated
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));

create policy categories_delete_own
  on public.categories for delete to authenticated
  using (seller_id = (select auth.uid()));
