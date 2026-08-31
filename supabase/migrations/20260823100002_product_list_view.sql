-- product_list_view: one row per product, with its variant facts rolled up.
--
-- WHY. `productSearchQuerySchema` lets a caller sort by price and by stock, but
-- neither lives on `products` - they are variant columns. Without this view the
-- API would have to fetch every product, fetch every variant, aggregate in
-- JavaScript and sort in memory, which cannot be paginated correctly: page 2
-- would be computed from a different set than page 1.
--
-- It also removes an N+1: a list of 25 products needed 26 queries to show a
-- price range and a variant count. Now it needs one.
--
-- SECURITY INVOKER, which is the whole point. A view normally runs with its
-- owner's rights, so it would happily return every seller's products and quietly
-- bypass the RLS policies underneath. With security_invoker the underlying
-- policies are evaluated as the caller, so this view is exactly as safe as
-- querying the tables directly.

create view public.product_list_view
with (security_invoker = on)
as
select
  p.id,
  p.workspace_id,
  p.seller_id,
  p.title,
  p.slug,
  p.description,
  p.status,
  p.tags,
  p.category_ids,
  p.search_text,
  p.created_at,
  p.updated_at,
  p.archived_at,
  count(v.id) as variant_count,
  -- Zero rather than null for a product with no variants. The contract forbids
  -- that state, but a view should not return null into a non-nullable field if
  -- one ever appears.
  coalesce(min(v.price_amount_minor), 0) as min_price_amount_minor,
  coalesce(max(v.price_amount_minor), 0) as max_price_amount_minor,
  coalesce(max(v.price_currency), 'PKR') as price_currency,
  -- Untracked variants contribute nothing rather than zero, so "no stock
  -- tracking" never reads as "out of stock".
  coalesce(sum(v.quantity_on_hand) filter (where v.track_inventory), 0) as total_quantity_on_hand,
  -- The distinct states present, rolled up to a single product state by the API.
  -- Kept as an array so the rule stays in one place in TypeScript rather than
  -- being duplicated in SQL.
  coalesce(
    array_agg(distinct v.inventory_state::text) filter (where v.id is not null),
    '{}'::text[]
  ) as variant_states
from public.products p
left join public.product_variants v on v.product_id = p.id
group by p.id;

comment on view public.product_list_view is
  'Products with variant price, stock and state rolled up, for list and search. security_invoker, so RLS applies as the caller.';

grant select on public.product_list_view to authenticated, service_role;
revoke all on public.product_list_view from anon;
