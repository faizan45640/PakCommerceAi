-- Product images table: stores primary/cover image and additional gallery photos
-- linked to products.

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  seller_id uuid not null references auth.users (id) on delete cascade,

  url text not null,
  alt_text text,
  position integer not null default 0,
  is_primary boolean not null default false,
  source jsonb default null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint product_images_url_not_blank check (btrim(url) <> ''),
  constraint product_images_alt_text_max_length check (char_length(alt_text) <= 160)
);

create index if not exists product_images_product_idx on public.product_images (product_id);
create index if not exists product_images_workspace_idx on public.product_images (workspace_id);
create index if not exists product_images_seller_idx on public.product_images (seller_id);

create trigger product_images_set_updated_at
  before update on public.product_images
  for each row
  execute function public.set_updated_at();

grant select, insert, update, delete on public.product_images to authenticated, service_role;
revoke all on public.product_images from anon;

alter table public.product_images enable row level security;

create policy product_images_select_own on public.product_images for select to authenticated
  using (seller_id = (select auth.uid()));

create policy product_images_insert_own on public.product_images for insert to authenticated
  with check (seller_id = (select auth.uid()));

create policy product_images_update_own on public.product_images for update to authenticated
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));

create policy product_images_delete_own on public.product_images for delete to authenticated
  using (seller_id = (select auth.uid()));
