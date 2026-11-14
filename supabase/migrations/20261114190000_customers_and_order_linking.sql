-- Customer 360: the customers table, notes, and the order -> customer link.
--
-- IDENTITY. A customer is one real person per workspace, identified by their
-- NORMALISED PHONE (unique per workspace), and by nothing else. Email is stored
-- lower-cased and is searchable, but it is NOT used for matching: email-only
-- matching arrives with store sync (Shopify/WooCommerce orders without a phone).
-- An order must carry a phone that normalises to something non-empty.
--
-- LINKING LIVES IN THE DATABASE. A trigger on orders upserts the customer and
-- sets orders.customer_id on every insert, so every insert path
-- (create_draft_order, direct REST, future sync/WhatsApp) is covered without
-- each one remembering to.
--   * INSERT refreshes the customer's latest-known name/city/address/email.
--   * UPDATE re-links only when the normalised phone actually changes (a typo
--     fix). It never rewrites the customer's details: editing an old order must
--     not change who the customer is today. The customer the order left is
--     deleted if it has no orders and no notes left (orders_drop_orphan_customer).
--   * customer_id cannot be edited directly, and customers.phone cannot be edited.
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
  constraint customers_phone_length check (char_length(phone) between 1 and 64),
  -- Phones are stored normalised. The one exception is the backfill key
  -- 'order:<order id>' given to legacy orders whose phone has no digits.
  constraint customers_phone_normalised check (
    phone = public.normalize_phone(phone)
    or phone ~ '^order:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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
  'Lower-cased and searchable. Not used to match orders to customers (that is phone only).';

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
-- order that has one. A legacy order whose phone has no digits gets its own
-- customer keyed 'order:<order id>', so the migration cannot abort on old data.
-- BACKFILL BEGIN (customers-schema.itest.ts runs this block against legacy-shaped rows)
with keyed as (
  select
    o.*,
    coalesce(nullif(public.normalize_phone(o.customer_phone), ''), 'order:' || o.id::text) as phone_key,
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
order by workspace_id, phone_key, created_at desc, id
on conflict (workspace_id, phone) do nothing;

-- The bulk update must not look like an edit to every order.
alter table public.orders disable trigger orders_set_updated_at;

update public.orders o
set customer_id = c.id
from public.customers c
where o.customer_id is null
  and c.workspace_id = o.workspace_id
  and c.phone = coalesce(nullif(public.normalize_phone(o.customer_phone), ''), 'order:' || o.id::text);

alter table public.orders enable trigger orders_set_updated_at;
-- BACKFILL END

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
  'Set by the link_order_to_customer trigger from the order''s normalised phone. Never supplied or edited by callers.';

-- ---------------------------------------------------------------------------
-- New orders need a usable phone
-- ---------------------------------------------------------------------------

-- NOT VALID: enforced for new and changed rows, without failing on legacy rows.
-- Added after the backfill because the backfill UPDATE would otherwise be
-- checked against it. (Postgres evaluates it on any later UPDATE of a legacy
-- junk-phone row too, so such a row cannot be edited until its phone is fixed.)
alter table public.orders
  add constraint orders_customer_phone_has_digits
  check (public.normalize_phone(customer_phone) <> '') not valid;

-- ---------------------------------------------------------------------------
-- The linking trigger
-- ---------------------------------------------------------------------------

-- SECURITY INVOKER, like create_draft_order, so RLS still applies: a seller can
-- only create their own customers.
create or replace function public.link_order_to_customer()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_phone text := public.normalize_phone(new.customer_phone);
  v_id uuid;
begin
  if tg_op = 'UPDATE' then
    if v_phone is not distinct from public.normalize_phone(old.customer_phone) then
      -- Same person: nothing to link, and customer_id is not editable.
      if new.customer_id is distinct from old.customer_id then
        raise exception 'orders.customer_id is set by the database from the phone; it cannot be edited'
          using errcode = 'restrict_violation';
      end if;
      return new;
    end if;
  end if;

  if v_phone = '' then
    raise exception 'customer phone must contain digits'
      using errcode = 'check_violation',
            constraint = 'orders_customer_phone_has_digits';
  end if;

  if tg_op = 'INSERT' then
    -- Create the customer, or refresh the existing one's latest-known details.
    insert into public.customers
      (workspace_id, seller_id, name, phone, email, city, address_line)
    values (
      new.workspace_id, new.seller_id, btrim(new.customer_name), v_phone,
      nullif(lower(btrim(new.customer_email)), ''), btrim(new.customer_city),
      nullif(btrim(new.customer_address_line), '')
    )
    on conflict (workspace_id, phone) do update
      set name = excluded.name,
          city = excluded.city,
          address_line = coalesce(excluded.address_line, public.customers.address_line),
          email = coalesce(excluded.email, public.customers.email)
    returning id into v_id;
  else
    -- Phone changed (a typo fix): move the order to the customer for the new
    -- phone, creating it if needed. Existing customers' details are left alone.
    select id into v_id
    from public.customers
    where workspace_id = new.workspace_id and phone = v_phone;

    if v_id is null then
      insert into public.customers
        (workspace_id, seller_id, name, phone, email, city, address_line)
      values (
        new.workspace_id, new.seller_id, btrim(new.customer_name), v_phone,
        nullif(lower(btrim(new.customer_email)), ''), btrim(new.customer_city),
        nullif(btrim(new.customer_address_line), '')
      )
      on conflict (workspace_id, phone) do nothing
      returning id into v_id;

      if v_id is null then
        select id into v_id
        from public.customers
        where workspace_id = new.workspace_id and phone = v_phone;
      end if;
    end if;
  end if;

  new.customer_id := v_id;
  return new;
end;
$$;

comment on function public.link_order_to_customer() is
  'BEFORE trigger on orders. INSERT: upserts the customer by (workspace, normalised phone), refreshing its latest-known details, and sets customer_id. UPDATE: re-links only when the normalised phone changes; refuses direct customer_id edits.';

revoke execute on function public.link_order_to_customer() from public, anon, authenticated;

-- Every UPDATE, so a direct customer_id edit is caught even when the phone is untouched.
create trigger orders_link_customer
  before insert or update
  on public.orders
  for each row
  execute function public.link_order_to_customer();

-- After a re-link, the customer the order left is removed when nothing refers
-- to it any more. Runs after the row update so the foreign key no longer holds it.
create or replace function public.drop_orphan_customer()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.customers c
  where c.id = old.customer_id
    and not exists (select 1 from public.orders o where o.customer_id = c.id)
    and not exists (select 1 from public.customer_notes n where n.customer_id = c.id);

  return null;
end;
$$;

comment on function public.drop_orphan_customer() is
  'AFTER trigger on orders: deletes the previous customer after a re-link when it has no orders and no notes.';

revoke execute on function public.drop_orphan_customer() from public, anon, authenticated;

create trigger orders_drop_orphan_customer
  after update
  on public.orders
  for each row
  when (old.customer_id is distinct from new.customer_id)
  execute function public.drop_orphan_customer();

-- ---------------------------------------------------------------------------
-- Customer guards
-- ---------------------------------------------------------------------------

-- The phone is the identity key: orders are linked by it, so it never changes.
-- (A wrong phone is fixed on the order, which re-links it.)
create or replace function public.refuse_customer_phone_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.phone is distinct from old.phone then
    raise exception 'customers.phone is the identity key and cannot be changed; correct the order instead'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.refuse_customer_phone_change() from public, anon, authenticated;

create trigger customers_refuse_phone_change
  before update of phone
  on public.customers
  for each row
  execute function public.refuse_customer_phone_change();

-- Customers are made by orders, never by the copilot's free-form SQL tool.
-- customer_notes stays writable (that tool is approval-gated).
create trigger customers_refuse_copilot_mutation
  before insert or update or delete on public.customers
  for each statement execute function public.refuse_copilot_mutation();

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
