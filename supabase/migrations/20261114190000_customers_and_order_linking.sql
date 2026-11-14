-- Customer 360: the customers table, notes, and the order -> customer link.
--
-- IDENTITY. A customer is one real person per workspace, identified by their
-- NORMALISED PHONE (unique per workspace). Email is stored lower-cased and is
-- used for matching only when an order has no usable phone. Phone always wins.
--
-- LINKING LIVES IN THE DATABASE. A trigger on orders upserts the customer and
-- sets orders.customer_id on every insert and on any change to the order's
-- phone or email. So every insert path (create_draft_order, direct REST,
-- future Shopify/WhatsApp sync) is covered without each one remembering to.
-- Orders keep their own customer snapshot columns unchanged: an order records
-- who it was placed for at that moment.
--
-- SPEND IS COMPUTED, NEVER STORED. customer_summary is a view, so lifetime
-- spend, order counts and last-order time cannot drift from the orders they
-- describe. See the inventory view for the same argument.
--
-- Mirrors packages/shared/src/customers/index.ts.

-- ---------------------------------------------------------------------------
-- Phone normalisation
-- ---------------------------------------------------------------------------

-- MUST stay in step with normalizePhone() in packages/shared/src/customers/phone.ts.
-- Both are tested against the same fixture table (phoneNormalizationFixtures).
--
-- Rules, in order:
--   strip spaces, dashes, dots, brackets; leading 00 -> +; keep digits only
--   92 + 10 digits          -> +92...
--   no '+': 0 + 10 digits   -> +92 + last 10 digits
--   no '+': 3 + 9 digits    -> +92 + the 10 digits
--   otherwise               -> '+' + digits if it had a '+', else the digits
--   no digits at all        -> '' (unusable)
create or replace function public.normalize_phone(raw text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  stripped text;
  had_plus boolean;
  digits text;
begin
  if raw is null then
    return null;
  end if;

  stripped := regexp_replace(raw, '[ \t\r\n().-]', '', 'g');
  if stripped like '00%' then
    stripped := '+' || substr(stripped, 3);
  end if;

  had_plus := stripped like '+%';
  digits := regexp_replace(stripped, '[^0-9]', '', 'g');

  if digits = '' then
    return '';
  end if;
  if digits ~ '^92[0-9]{10}$' then
    return '+' || digits;
  end if;
  if not had_plus then
    if digits ~ '^0[0-9]{10}$' then
      return '+92' || substr(digits, 2);
    end if;
    if digits ~ '^3[0-9]{9}$' then
      return '+92' || digits;
    end if;
  end if;

  if had_plus then
    return '+' || digits;
  end if;
  return digits;
end;
$$;

comment on function public.normalize_phone(text) is
  'Customer identity key. Pakistan-first phone normalisation; mirrors normalizePhone() in packages/shared. Returns empty string when there are no digits.';

revoke execute on function public.normalize_phone(text) from public, anon;
grant execute on function public.normalize_phone(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,
  seller_id uuid not null,

  -- Latest-known values, refreshed from each linked order.
  name text not null,
  -- Normalised. The identity key, unique per workspace.
  phone text not null,
  -- Lower-cased.
  email text,
  city text not null,
  address_line text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint customers_workspace_seller_fkey
    foreign key (workspace_id, seller_id)
    references public.workspaces (id, seller_id)
    on delete cascade,

  -- Lets orders and customer_notes declare composite keys so a child row cannot
  -- drift into a different workspace from its customer.
  constraint customers_id_workspace_id_key unique (id, workspace_id),
  constraint customers_workspace_phone_key unique (workspace_id, phone),

  constraint customers_name_not_blank check (btrim(name) <> ''),
  constraint customers_name_max_length check (char_length(name) <= 160),
  constraint customers_phone_length check (char_length(phone) between 1 and 32),
  -- Phones are stored normalised; a phone with no digits (unusable) is kept as typed.
  constraint customers_phone_normalised check (
    phone = public.normalize_phone(phone) or public.normalize_phone(phone) = ''
  ),
  constraint customers_email_lowercase check (
    email is null
    or (email = lower(email) and btrim(email) <> '' and char_length(email) <= 254)
  ),
  constraint customers_city_not_blank check (btrim(city) <> ''),
  constraint customers_city_max_length check (char_length(city) <= 80),
  constraint customers_address_max_length
    check (address_line is null or char_length(address_line) <= 300)
);

create index customers_workspace_created_idx
  on public.customers (workspace_id, created_at desc);
create index customers_workspace_email_idx
  on public.customers (workspace_id, email)
  where email is not null;
create index customers_seller_id_idx on public.customers (seller_id);

create trigger customers_set_updated_at
  before update on public.customers
  for each row
  execute function public.set_updated_at();

comment on table public.customers is
  'One person per workspace, identified by normalised phone. Created and refreshed by the orders trigger; spend and counts live in customer_summary.';
comment on column public.customers.phone is
  'Normalised with normalize_phone(). Unique per workspace.';
comment on column public.customers.email is
  'Lower-cased. Used for matching only when an order has no usable phone.';

grant select, insert, update, delete on public.customers to authenticated, service_role;
revoke all on public.customers from anon;

alter table public.customers enable row level security;

create policy customers_select_own
  on public.customers for select to authenticated
  using (seller_id = (select auth.uid()));

create policy customers_insert_own
  on public.customers for insert to authenticated
  with check (seller_id = (select auth.uid()));

create policy customers_update_own
  on public.customers for update to authenticated
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));

create policy customers_delete_own
  on public.customers for delete to authenticated
  using (seller_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- customer_notes
-- ---------------------------------------------------------------------------

create type public.customer_note_kind as enum ('note', 'risk');

create table public.customer_notes (
  id uuid primary key default gen_random_uuid(),

  customer_id uuid not null,
  workspace_id uuid not null,
  seller_id uuid not null,

  kind public.customer_note_kind not null default 'note',
  body text not null,

  -- Who wrote it. Null is reserved for system/agent rows written with service role.
  created_by uuid references auth.users (id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint customer_notes_workspace_seller_fkey
    foreign key (workspace_id, seller_id)
    references public.workspaces (id, seller_id)
    on delete cascade,

  constraint customer_notes_customer_workspace_fkey
    foreign key (customer_id, workspace_id)
    references public.customers (id, workspace_id)
    on delete cascade,

  constraint customer_notes_body_not_blank check (btrim(body) <> ''),
  constraint customer_notes_body_max_length check (char_length(body) <= 2000)
);

create index customer_notes_customer_created_idx
  on public.customer_notes (customer_id, created_at desc);
create index customer_notes_seller_id_idx on public.customer_notes (seller_id);

create trigger customer_notes_set_updated_at
  before update on public.customer_notes
  for each row
  execute function public.set_updated_at();

comment on table public.customer_notes is
  'Seller notes on a customer. kind = risk flags the customer (e.g. refuses delivery).';

grant select, insert, update, delete on public.customer_notes to authenticated, service_role;
revoke all on public.customer_notes from anon;

alter table public.customer_notes enable row level security;

create policy customer_notes_select_own
  on public.customer_notes for select to authenticated
  using (seller_id = (select auth.uid()));

-- created_by is checked, not trusted: it answers "who wrote this".
create policy customer_notes_insert_own
  on public.customer_notes for insert to authenticated
  with check (
    seller_id = (select auth.uid())
    and (created_by is null or created_by = (select auth.uid()))
  );

create policy customer_notes_update_own
  on public.customer_notes for update to authenticated
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));

create policy customer_notes_delete_own
  on public.customer_notes for delete to authenticated
  using (seller_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- orders.customer_id
-- ---------------------------------------------------------------------------

alter table public.orders add column customer_id uuid;

-- Backfill without the trigger: one customer per (workspace, normalised phone).
-- Name and city come from the latest order; address and email from the latest
-- order that has one. Orders whose phone has no digits are keyed by the phone
-- as typed.
with keyed as (
  select
    o.*,
    coalesce(nullif(public.normalize_phone(o.customer_phone), ''), btrim(o.customer_phone)) as phone_key,
    nullif(lower(btrim(o.customer_email)), '') as email_norm
  from public.orders o
),
ranked as (
  select
    k.workspace_id,
    k.seller_id,
    k.phone_key,
    k.created_at,
    k.id,
    btrim(k.customer_name) as name,
    btrim(k.customer_city) as city,
    first_value(k.email_norm) over latest_with_email as email,
    first_value(nullif(btrim(k.customer_address_line), '')) over latest_with_address as address_line,
    min(k.created_at) over (partition by k.workspace_id, k.phone_key) as first_seen
  from keyed k
  window
    latest_with_email as (
      partition by k.workspace_id, k.phone_key
      order by (k.email_norm is null), k.created_at desc
    ),
    latest_with_address as (
      partition by k.workspace_id, k.phone_key
      order by (nullif(btrim(k.customer_address_line), '') is null), k.created_at desc
    )
)
insert into public.customers
  (workspace_id, seller_id, name, phone, email, city, address_line, created_at)
select distinct on (workspace_id, phone_key)
  workspace_id, seller_id, name, phone_key, email, city, address_line, first_seen
from ranked
order by workspace_id, phone_key, created_at desc, id;

-- The bulk update must not look like an edit to every order.
alter table public.orders disable trigger orders_set_updated_at;

update public.orders o
set customer_id = c.id
from public.customers c
where c.workspace_id = o.workspace_id
  and c.phone = coalesce(nullif(public.normalize_phone(o.customer_phone), ''), btrim(o.customer_phone));

alter table public.orders enable trigger orders_set_updated_at;

alter table public.orders alter column customer_id set not null;

-- Composite tenant key: an order cannot point at another workspace's customer.
-- No ON DELETE CASCADE: a customer with orders cannot be deleted by accident.
-- (Removing a workspace still works: it cascades to both tables.)
alter table public.orders
  add constraint orders_customer_workspace_fkey
  foreign key (customer_id, workspace_id)
  references public.customers (id, workspace_id);

create index orders_customer_created_idx
  on public.orders (customer_id, created_at desc);

comment on column public.orders.customer_id is
  'Set by the link_order_to_customer trigger from the order''s phone (or email). Never supplied by callers.';

-- ---------------------------------------------------------------------------
-- The linking trigger
-- ---------------------------------------------------------------------------

-- SECURITY INVOKER, like create_draft_order, so RLS still applies: a seller can
-- only create or refresh their own customers.
create or replace function public.link_order_to_customer()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_phone text := public.normalize_phone(new.customer_phone);
  v_email text := nullif(lower(btrim(new.customer_email)), '');
  v_name text := btrim(new.customer_name);
  v_city text := btrim(new.customer_city);
  v_address text := nullif(btrim(new.customer_address_line), '');
  v_id uuid;
begin
  if v_phone = '' then
    -- No usable phone: fall back to email, then to the phone as typed.
    if v_email is not null then
      select id into v_id
      from public.customers
      where workspace_id = new.workspace_id and email = v_email
      order by created_at, id
      limit 1;
    end if;

    if v_id is not null then
      update public.customers
      set name = v_name,
          city = v_city,
          address_line = coalesce(v_address, address_line)
      where id = v_id;

      new.customer_id := v_id;
      return new;
    end if;

    v_phone := btrim(new.customer_phone);
  end if;

  insert into public.customers
    (workspace_id, seller_id, name, phone, email, city, address_line)
  values
    (new.workspace_id, new.seller_id, v_name, v_phone, v_email, v_city, v_address)
  on conflict (workspace_id, phone) do update
    set name = excluded.name,
        city = excluded.city,
        address_line = coalesce(excluded.address_line, public.customers.address_line),
        email = coalesce(excluded.email, public.customers.email)
  returning id into v_id;

  new.customer_id := v_id;
  return new;
end;
$$;

comment on function public.link_order_to_customer() is
  'BEFORE trigger on orders: upserts the customer by (workspace, normalised phone), refreshes its latest-known details, and sets orders.customer_id.';

revoke execute on function public.link_order_to_customer() from public, anon, authenticated;

create trigger orders_link_customer
  before insert or update of customer_phone, customer_email
  on public.orders
  for each row
  execute function public.link_order_to_customer();

-- ---------------------------------------------------------------------------
-- customer_summary (computed, never stored)
-- ---------------------------------------------------------------------------

-- One row per customer: the customer's columns plus everything derived from
-- their orders and notes. SECURITY INVOKER so RLS on customers, orders and
-- customer_notes applies as the caller (same as inventory and product_list_view).
--
-- Completed = confirmed, shipped or delivered. Lifetime spend and the average
-- order value count only those; drafts, cancelled and returned orders do not.
-- first/last_order_at are the created_at of the earliest/latest order of any status.
create view public.customer_summary
with (security_invoker = on)
as
select
  c.id,
  c.workspace_id,
  c.seller_id,
  c.name,
  c.phone,
  c.email,
  c.city,
  c.address_line,
  c.created_at,
  c.updated_at,
  count(o.id)::integer as total_order_count,
  (count(o.id) filter (where o.status in ('confirmed', 'shipped', 'delivered')))::integer
    as completed_order_count,
  coalesce(
    sum(o.total_amount_minor) filter (where o.status in ('confirmed', 'shipped', 'delivered')),
    0
  )::bigint as lifetime_spend_amount_minor,
  round(
    avg(o.total_amount_minor) filter (where o.status in ('confirmed', 'shipped', 'delivered'))
  )::bigint as average_order_amount_minor,
  (count(o.id) filter (where o.status = 'draft'))::integer as draft_order_count,
  (count(o.id) filter (where o.status = 'confirmed'))::integer as confirmed_order_count,
  (count(o.id) filter (where o.status = 'shipped'))::integer as shipped_order_count,
  (count(o.id) filter (where o.status = 'delivered'))::integer as delivered_order_count,
  (count(o.id) filter (where o.status = 'cancelled'))::integer as cancelled_order_count,
  (count(o.id) filter (where o.status = 'returned'))::integer as returned_order_count,
  min(o.created_at) as first_order_at,
  max(o.created_at) as last_order_at,
  (select count(*) from public.customer_notes n where n.customer_id = c.id)::integer
    as note_count,
  (select count(*) from public.customer_notes n
    where n.customer_id = c.id and n.kind = 'risk')::integer as risk_note_count
from public.customers c
left join public.orders o
  on o.customer_id = c.id and o.workspace_id = c.workspace_id
group by c.id;

comment on view public.customer_summary is
  'Per-customer spend, order counts and last-order time, computed from orders. Read-only, security_invoker, so RLS applies as the caller.';

grant select on public.customer_summary to authenticated, service_role;
revoke all on public.customer_summary from anon;
revoke insert, update, delete, truncate on public.customer_summary from authenticated;
