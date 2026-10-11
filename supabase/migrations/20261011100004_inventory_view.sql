-- inventory: one row per stock-tracked variant, in the shape of the inventory
-- contract (inventorySchema in packages/shared/src/inventory/index.ts).
--
-- A VIEW, NOT A TABLE. Every number here already lives on product_variants. A
-- table would copy them, and a copy has to be kept in step by every writer,
-- forever - the product API, the copilot's stock tool, a sync job. A view
-- cannot drift, because it stores nothing. See the reserved_quantity migration
-- for the longer version of this argument.
--
-- It is therefore read-only: it joins two tables, so Postgres will not accept
-- writes through it. Stock is written on product_variants, and each change is
-- recorded in stock_movements.
--
-- `id` is the variant's id. An inventory record and its variant are one-to-one,
-- so a second identifier would only be something else to map.
--
-- Untracked variants have no row, as the contract specifies: "no stock tracking"
-- must never read as "zero stock".
--
-- SECURITY INVOKER, which is the whole point. A view normally runs with its
-- owner's rights, so it would return every seller's stock and bypass the RLS
-- policies underneath. With security_invoker those policies are evaluated as
-- the caller, so this view is exactly as safe as querying the tables directly.

create view public.inventory
with (security_invoker = on)
as
select
  v.id,
  v.id as variant_id,
  v.product_id,
  p.seller_id,
  v.workspace_id,
  v.track_inventory,
  v.quantity_on_hand,
  v.reserved_quantity,
  -- Derived here and nowhere else. This is what selling workflows may promise.
  v.quantity_on_hand - v.reserved_quantity as available_quantity,
  v.low_stock_threshold,
  -- The variant's generated column, not a second copy of the rule.
  v.inventory_state as state,
  v.created_at,
  v.updated_at
from public.product_variants v
join public.products p on p.id = v.product_id
where v.track_inventory
  and v.quantity_on_hand is not null;

comment on view public.inventory is
  'Stock per tracked variant: on hand, reserved, available and state. Read-only, security_invoker, so RLS applies as the caller.';

grant select on public.inventory to authenticated, service_role;
revoke all on public.inventory from anon;
-- Supabase default privileges grant everything on new relations. The view is
-- not writable anyway; this makes the privilege layer say so too.
revoke insert, update, delete, truncate on public.inventory from authenticated;
