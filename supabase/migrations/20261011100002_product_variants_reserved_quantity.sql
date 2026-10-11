-- Reserved stock on product_variants.
--
-- The inventory contract (packages/shared/src/inventory) distinguishes three
-- quantities per variant:
--
--   quantity_on_hand   - units physically present
--   reserved_quantity  - units promised to confirmed-but-unfulfilled orders
--   available          - on hand minus reserved; DERIVED, never stored
--
-- WHY HERE AND NOT IN A NEW TABLE. Stock already lives on product_variants, and
-- the product API, product_list_view and the copilot all read it there. A
-- separate inventory table holding its own quantity would be a second place to
-- change the same number, and the two would eventually disagree - which a
-- customer experiences as buying something that is not there. "Inventory has
-- one source of truth" is a project invariant, so the new quantity joins the
-- existing ones and the `inventory` relation (next migration but one) is a view
-- over them rather than a copy.

alter table public.product_variants
  add column reserved_quantity integer not null default 0;

alter table public.product_variants
  add constraint product_variants_reserved_quantity_non_negative
    check (reserved_quantity >= 0),
  -- Reserved units are a subset of the units on hand. An untracked variant has
  -- no quantity to reserve against, so it may only hold zero.
  add constraint product_variants_reserved_within_on_hand
    check (
      reserved_quantity = 0
      or (quantity_on_hand is not null and reserved_quantity <= quantity_on_hand)
    );

-- inventory_state now follows AVAILABLE stock, as the contract defines it: five
-- on the shelf with five already promised is out of stock, not in stock.
--
-- The expression is changed in place rather than by dropping and re-adding the
-- column, so product_list_view and the inventory-state index that depend on it
-- survive. Every existing row has reserved_quantity = 0, so no state changes
-- value when this runs.
alter table public.product_variants
  alter column inventory_state set expression as (
    case
      when not track_inventory then 'untracked'::public.inventory_state
      when quantity_on_hand is null then 'untracked'::public.inventory_state
      when quantity_on_hand - reserved_quantity <= 0 then 'out_of_stock'::public.inventory_state
      when low_stock_threshold is not null
        and quantity_on_hand - reserved_quantity <= low_stock_threshold
        then 'low_stock'::public.inventory_state
      else 'in_stock'::public.inventory_state
    end
  );

-- Lets stock_movements declare one composite key on (variant, product,
-- workspace), so a movement cannot name a variant together with a product or
-- workspace it does not belong to.
alter table public.product_variants
  add constraint product_variants_id_product_workspace_key
    unique (id, product_id, workspace_id);

comment on column public.product_variants.reserved_quantity is
  'Units promised to confirmed-but-unfulfilled orders. Available = quantity_on_hand - reserved_quantity.';
comment on column public.product_variants.inventory_state is
  'Generated from track_inventory, quantity_on_hand, reserved_quantity and low_stock_threshold. Not writable.';
