-- Enum types for the product catalogue.
--
-- Values mirror packages/shared/src/products/index.ts exactly. A conformance
-- test asserts they stay in step — if someone adds a Zod value without adding it
-- here, that test fails rather than a runtime insert failing in production.
--
-- Separate migration from the tables so that adding a value later (which needs
-- its own ALTER TYPE) has an obvious home.

-- Product lifecycle. Independent of stock: an active product may have an
-- out-of-stock variant.
create type public.product_status as enum (
  'draft',
  'active',
  'archived'
);

-- Whether a variant is sellable at all, regardless of stock.
create type public.product_variant_status as enum (
  'active',
  'inactive'
);

-- Derived from quantity and threshold — never set by hand. See the generated
-- column on product_variants.
create type public.inventory_state as enum (
  'in_stock',
  'low_stock',
  'out_of_stock',
  'untracked'
);
