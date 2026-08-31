-- create_product(): insert a product and its variants atomically.
--
-- WHY A FUNCTION. supabase-js has no transactions. Creating a product is two
-- inserts - the product, then its variants - and if the second fails the first
-- has already committed. That leaves a product with zero variants, which the
-- contract says cannot exist (`productSchema.variants` is `.min(1)`), and which
-- would then fail to parse forever after.
--
-- A function body is a single statement from the client's point of view, so it
-- either all happens or none of it does. The alternative - insert, then delete
-- the product if the variants fail - is a compensating write that can itself
-- fail, and races with anything else touching the row.
--
-- SECURITY INVOKER, deliberately. The function runs with the caller's rights, so
-- the RLS policies on both tables still apply exactly as they would for a direct
-- insert. SECURITY DEFINER would have made this a hole straight through tenant
-- isolation: a seller could pass any seller_id and the database would accept it.
--
-- search_path is pinned empty and every name is schema-qualified, so a caller
-- cannot redirect these inserts at tables of their own.

create or replace function public.create_product(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_product_id uuid;
  workspace uuid := (payload ->> 'workspace_id')::uuid;
begin
  insert into public.products (
    workspace_id, seller_id, title, slug, description, status,
    tags, category_ids, options, search_text
  )
  values (
    workspace,
    (payload ->> 'seller_id')::uuid,
    payload ->> 'title',
    payload ->> 'slug',
    payload ->> 'description',
    coalesce(payload ->> 'status', 'draft')::public.product_status,
    coalesce(array(select jsonb_array_elements_text(payload -> 'tags')), '{}'::text[]),
    coalesce(array(select (jsonb_array_elements_text(payload -> 'category_ids'))::uuid), '{}'::uuid[]),
    coalesce(payload -> 'options', '[]'::jsonb),
    coalesce(payload ->> 'search_text', '')
  )
  returning id into new_product_id;

  insert into public.product_variants (
    product_id, workspace_id, title, sku, barcode, status,
    price_amount_minor, price_currency,
    compare_at_price_amount_minor, compare_at_price_currency,
    option_values, track_inventory, quantity_on_hand, low_stock_threshold, position
  )
  select
    new_product_id,
    workspace,
    variant ->> 'title',
    variant ->> 'sku',
    variant ->> 'barcode',
    coalesce(variant ->> 'status', 'active')::public.product_variant_status,
    (variant ->> 'price_amount_minor')::integer,
    coalesce(variant ->> 'price_currency', 'PKR'),
    (variant ->> 'compare_at_price_amount_minor')::integer,
    variant ->> 'compare_at_price_currency',
    coalesce(variant -> 'option_values', '[]'::jsonb),
    coalesce((variant ->> 'track_inventory')::boolean, true),
    (variant ->> 'quantity_on_hand')::integer,
    (variant ->> 'low_stock_threshold')::integer,
    -- Falls back to the order they arrived in, so a caller that does not care
    -- about ordering still gets stable, distinct positions.
    coalesce((variant ->> 'position')::integer, (ordinality - 1)::integer)
  from jsonb_array_elements(coalesce(payload -> 'variants', '[]'::jsonb))
       with ordinality as elements(variant, ordinality);

  -- The contract's "at least one variant" rule, enforced where it cannot be
  -- skipped. Without this an empty variants array would quietly create the
  -- orphan product this whole function exists to prevent.
  if not found then
    raise exception 'a product must have at least one variant'
      using errcode = 'check_violation';
  end if;

  return new_product_id;
end;
$$;

comment on function public.create_product(jsonb) is
  'Inserts a product and its variants atomically. Runs as the caller, so RLS applies.';

-- Only signed-in sellers may call it. anon is revoked explicitly because
-- Supabase default privileges grant EXECUTE on new functions to anon - the same
-- trap as tables, and silence is not the same as granting nothing.
grant execute on function public.create_product(jsonb) to authenticated, service_role;
revoke execute on function public.create_product(jsonb) from anon;
