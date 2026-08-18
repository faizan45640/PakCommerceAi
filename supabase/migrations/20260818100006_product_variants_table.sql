-- The product_variants table.
--
-- The variant is the thing a customer actually buys: "Lawn Kurta, Medium, Blue".
-- Price, SKU and stock live here rather than on products, because a seller never
-- has "12 Lawn Kurtas" - they have 5 medium, 4 large, 3 small.
--
-- Mirrors productVariantSchema in packages/shared/src/products/index.ts.

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),

  product_id uuid not null,
  -- Carried so RLS and tenant filters need no join. The composite key below
  -- guarantees it matches the parent product's workspace.
  workspace_id uuid not null,

  title text not null,
  sku text,
  barcode text,
  status public.product_variant_status not null default 'active',

  -- Money is integer MINOR units (paisa), never a float. Currency is stored
  -- explicitly: the contract is PKR-only today, but a USD Shopify store is a
  -- known open question and a column costs less now than a migration later.
  price_amount_minor integer not null,
  price_currency text not null default 'PKR',
  compare_at_price_amount_minor integer,
  compare_at_price_currency text,

  -- Which option values this variant represents, e.g. [{"optionName":"Size","value":"M"}].
  option_values jsonb not null default '[]'::jsonb,

  -- Inventory inputs. The state below is derived from them.
  track_inventory boolean not null default true,
  quantity_on_hand integer,
  low_stock_threshold integer,

  -- Derived, not stored by the application. A writable state column would be a
  -- second source of truth for stock and would eventually contradict the
  -- quantity. "Inventory has one source of truth" is a project invariant.
  inventory_state public.inventory_state
    generated always as (
      case
        when not track_inventory then 'untracked'::public.inventory_state
        when quantity_on_hand is null then 'untracked'::public.inventory_state
        when quantity_on_hand <= 0 then 'out_of_stock'::public.inventory_state
        when low_stock_threshold is not null
          and quantity_on_hand <= low_stock_threshold
          then 'low_stock'::public.inventory_state
        else 'in_stock'::public.inventory_state
      end
    ) stored,

  position integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A variant cannot drift into a different workspace from its product.
  constraint product_variants_product_workspace_fkey
    foreign key (product_id, workspace_id)
    references public.products (id, workspace_id)
    on delete cascade,

  constraint product_variants_title_not_blank check (btrim(title) <> ''),
  constraint product_variants_title_max_length check (char_length(title) <= 160),

  -- Money can be zero (a free gift) but never negative.
  constraint product_variants_price_non_negative check (price_amount_minor >= 0),
  constraint product_variants_compare_at_price_non_negative
    check (compare_at_price_amount_minor is null or compare_at_price_amount_minor >= 0),

  -- Shape check only. The Zod contract pins PKR at the application boundary;
  -- this stops nonsense reaching storage without needing a migration to widen.
  constraint product_variants_price_currency_iso check (price_currency ~ '^[A-Z]{3}$'),
  constraint product_variants_compare_at_currency_iso
    check (compare_at_price_currency is null or compare_at_price_currency ~ '^[A-Z]{3}$'),
  -- A compare-at amount is meaningless without its currency, and vice versa.
  constraint product_variants_compare_at_price_complete check (
    (compare_at_price_amount_minor is null and compare_at_price_currency is null)
    or (compare_at_price_amount_minor is not null and compare_at_price_currency is not null)
  ),

  constraint product_variants_option_values_is_array
    check (jsonb_typeof(option_values) = 'array'),
  constraint product_variants_option_values_max
    check (jsonb_array_length(option_values) <= 3),

  constraint product_variants_quantity_non_negative
    check (quantity_on_hand is null or quantity_on_hand >= 0),
  constraint product_variants_low_stock_threshold_non_negative
    check (low_stock_threshold is null or low_stock_threshold >= 0),
  constraint product_variants_position_non_negative check (position >= 0)
);

-- SKU is what a seller types into a courier form or a spreadsheet. It must be
-- unambiguous within a workspace, but it is optional, so nulls are excluded.
create unique index product_variants_workspace_sku_key
  on public.product_variants (workspace_id, sku)
  where sku is not null;

create index product_variants_product_id_idx on public.product_variants (product_id);
create index product_variants_workspace_id_idx on public.product_variants (workspace_id);
-- Powers the low-stock and out-of-stock dashboards.
create index product_variants_workspace_inventory_state_idx
  on public.product_variants (workspace_id, inventory_state);

create trigger product_variants_set_updated_at
  before update on public.product_variants
  for each row
  execute function public.set_updated_at();

comment on table public.product_variants is
  'The buyable unit. Price, SKU and stock live here.';
comment on column public.product_variants.price_amount_minor is
  'Integer minor units (paisa for PKR). Never a float.';
comment on column public.product_variants.inventory_state is
  'Generated from track_inventory, quantity_on_hand and low_stock_threshold. Not writable.';
