-- The orders table.
--
-- Mirrors orderSchema in packages/shared/src/orders/index.ts (header fields).
-- Line items live in order_items; status changes live in order_status_history.
--
-- Customer identity is a snapshot on the order (name, phone, city, optional
-- email and address). A future customerId FK belongs to T-043+, not here.
--
-- Money is integer minor units (paisa), never a float — same pattern as
-- product_variants.price_amount_minor.

create table public.orders (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,
  seller_id uuid not null,

  status public.order_status not null default 'draft',
  channel public.order_channel not null default 'manual',
  payment_method public.order_payment_method not null default 'cod',

  customer_name text not null,
  customer_phone text not null,
  customer_city text not null,
  customer_email text,
  customer_address_line text,

  subtotal_amount_minor integer not null,
  shipping_fee_amount_minor integer not null default 0,
  total_amount_minor integer not null,
  currency text not null default 'PKR',

  note text,

  confirmed_at timestamptz,
  cancelled_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint orders_workspace_seller_fkey
    foreign key (workspace_id, seller_id)
    references public.workspaces (id, seller_id)
    on delete cascade,

  -- Lets order_items and order_status_history declare composite keys so a child
  -- row cannot drift into a different workspace from its order.
  constraint orders_id_workspace_id_key unique (id, workspace_id),

  constraint orders_customer_name_not_blank check (btrim(customer_name) <> ''),
  constraint orders_customer_name_max_length check (char_length(customer_name) <= 160),
  constraint orders_customer_phone_length check (char_length(customer_phone) between 5 and 32),
  constraint orders_customer_city_not_blank check (btrim(customer_city) <> ''),
  constraint orders_customer_city_max_length check (char_length(customer_city) <= 80),
  constraint orders_customer_address_max_length
    check (customer_address_line is null or char_length(customer_address_line) <= 300),
  constraint orders_note_max_length
    check (note is null or char_length(note) <= 1000),

  constraint orders_subtotal_non_negative check (subtotal_amount_minor >= 0),
  constraint orders_shipping_fee_non_negative check (shipping_fee_amount_minor >= 0),
  constraint orders_total_non_negative check (total_amount_minor >= 0),
  constraint orders_total_matches_parts
    check (total_amount_minor = subtotal_amount_minor + shipping_fee_amount_minor),
  constraint orders_currency_iso check (currency ~ '^[A-Z]{3}$'),

  -- Draft must not carry a confirmation stamp (shared contract).
  constraint orders_draft_has_no_confirmed_at check (
    status <> 'draft' or confirmed_at is null
  ),
  -- Confirmed-path statuses require a confirmation stamp and a delivery address.
  constraint orders_confirmed_path_requires_stamp check (
    status not in ('confirmed', 'shipped', 'delivered', 'returned')
    or confirmed_at is not null
  ),
  constraint orders_confirmed_path_requires_address check (
    status not in ('confirmed', 'shipped', 'delivered', 'returned')
    or (customer_address_line is not null and btrim(customer_address_line) <> '')
  ),
  -- cancelled_at is only meaningful for cancelled orders.
  constraint orders_cancelled_at_matches_status check (
    (status = 'cancelled' and cancelled_at is not null)
    or (status <> 'cancelled' and cancelled_at is null)
  )
);

create index orders_workspace_created_idx
  on public.orders (workspace_id, created_at desc);
create index orders_workspace_status_idx
  on public.orders (workspace_id, status);
create index orders_seller_id_idx on public.orders (seller_id);

create trigger orders_set_updated_at
  before update on public.orders
  for each row
  execute function public.set_updated_at();

comment on table public.orders is
  'A purchase. Drafts do not touch stock; confirmation is the stock event (T-037).';
comment on column public.orders.subtotal_amount_minor is
  'Integer minor units (paisa for PKR). Must equal the sum of line totals.';
comment on column public.orders.customer_address_line is
  'Optional on drafts; required once the order is on the confirmed path.';
