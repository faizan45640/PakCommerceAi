-- Enum types for the order lifecycle.
--
-- Values mirror packages/shared/src/orders/index.ts exactly. A conformance
-- test asserts they stay in step — if someone adds a Zod value without adding
-- it here, that test fails rather than a runtime insert failing in production.
--
-- Separate migration from the tables so that adding a value later (which needs
-- its own ALTER TYPE) has an obvious home.

create type public.order_status as enum (
  'draft',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
  'returned'
);

create type public.order_channel as enum (
  'whatsapp',
  'shopify',
  'woocommerce',
  'instagram',
  'facebook',
  'manual'
);

create type public.order_payment_method as enum (
  'cod',
  'prepaid'
);

-- Closed transition map from ORDER_STATUS_TRANSITIONS in the shared contract.
-- Used by order_status_history checks so a hand-written INSERT cannot invent
-- an illegal jump (for example draft → shipped).
create function public.is_allowed_order_status_transition(
  from_status public.order_status,
  to_status public.order_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case from_status
    when 'draft' then to_status in ('confirmed', 'cancelled')
    when 'confirmed' then to_status in ('shipped', 'cancelled')
    when 'shipped' then to_status in ('delivered', 'returned')
    when 'delivered' then to_status = 'returned'
    when 'cancelled' then false
    when 'returned' then false
    else false
  end;
$$;

comment on function public.is_allowed_order_status_transition(public.order_status, public.order_status) is
  'True when from_status → to_status is a legal order lifecycle transition.';

revoke execute on function public.is_allowed_order_status_transition(public.order_status, public.order_status)
  from public, anon;
grant execute on function public.is_allowed_order_status_transition(public.order_status, public.order_status)
  to authenticated, service_role;
