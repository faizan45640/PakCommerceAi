-- The order_items table.
--
-- Mirrors orderItemSchema in packages/shared/src/orders/index.ts.
-- Line items reference variants, not products alone. Title / variant_title /
-- sku / unit price are snapshots so a later catalogue edit does not rewrite
-- history on past orders.

create table public.order_items (
  id uuid primary key default gen_random_uuid(),

  order_id uuid not null,
  product_id uuid not null,
  variant_id uuid not null,

  -- Tenancy. Carried so RLS needs no join; composite keys keep them honest.
  workspace_id uuid not null,
  seller_id uuid not null,

  title text not null,
  variant_title text,
  sku text,

  quantity integer not null,
  unit_price_amount_minor integer not null,
  line_total_amount_minor integer not null,
  currency text not null default 'PKR',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint order_items_workspace_seller_fkey
    foreign key (workspace_id, seller_id)
    references public.workspaces (id, seller_id)
    on delete cascade,

  constraint order_items_order_workspace_fkey
    foreign key (order_id, workspace_id)
    references public.orders (id, workspace_id)
    on delete cascade,

  -- NO ACTION, deliberately not CASCADE. Deleting a variant on its own must
  -- not erase line items on historical orders — the catalogue retires things
  -- by archiving. Removing a whole workspace still cascades via the key above.
  constraint order_items_variant_fkey
    foreign key (variant_id, product_id, workspace_id)
    references public.product_variants (id, product_id, workspace_id),

  constraint order_items_title_not_blank check (btrim(title) <> ''),
  constraint order_items_title_max_length check (char_length(title) <= 180),
  constraint order_items_variant_title_max_length
    check (variant_title is null or char_length(variant_title) <= 160),
  constraint order_items_quantity_positive check (quantity > 0),
  constraint order_items_unit_price_non_negative check (unit_price_amount_minor >= 0),
  constraint order_items_line_total_non_negative check (line_total_amount_minor >= 0),
  constraint order_items_line_total_matches
    check (line_total_amount_minor = quantity * unit_price_amount_minor),
  constraint order_items_currency_iso check (currency ~ '^[A-Z]{3}$')
);

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_workspace_id_idx on public.order_items (workspace_id);
create index order_items_seller_id_idx on public.order_items (seller_id);
create index order_items_variant_id_idx on public.order_items (variant_id);

create trigger order_items_set_updated_at
  before update on public.order_items
  for each row
  execute function public.set_updated_at();

comment on table public.order_items is
  'A line on an order. Prices and titles are snapshots from create time.';
comment on column public.order_items.line_total_amount_minor is
  'Must equal quantity * unit_price_amount_minor.';
