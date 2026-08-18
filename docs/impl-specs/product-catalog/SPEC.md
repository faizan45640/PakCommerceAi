# Implementation Spec — `product-catalog` (T-020)

**Task:** T-020 · Slice S03 Product Catalog Workflow · Area: API · Priority P0/Critical
**Owner:** Talha · **Support:** Faizan, Monis
**Depends on:** the product contract — `packages/shared/src/products/index.ts` (exists, versioned `2026-07-12`, 24 tests)
**Governed by:** [`../../../implementation-workflow.md`](../../../implementation-workflow.md)

---

## 1. What this delivers

The `products` and `product_variants` tables, as a **migration**, so the catalogue can
exist in the database instead of as hardcoded arrays in the dashboards.

Before this task the database had three tables — `profiles`, `seller_profiles`,
`workspaces` — and **no migrations at all**. The schema was created by hand in the Supabase
dashboard and could not be reproduced from source control.

So T-020 delivers two things, not one:

1. **The migration mechanism** for the whole project — how migrations are written, where
   they live, how they are tested. Every table Monis or Faizan adds after this follows it.
2. **The two tables** the task names.

## 2. Why the split into two tables

A seller does not have "12 Lawn Kurtas". They have 5 medium, 4 large, 3 small — each with
its own SKU, price and stock count.

- `products` — the item. Title, slug, status, tags, options.
- `product_variants` — the buyable unit. SKU, price, stock.

Every inventory feature in the project depends on that distinction. The contract already
encodes it: `productSchema.variants` is `.min(1)`, so even a "simple" product has one
variant.

## 3. Decisions

Recorded here because each was a genuine fork, and guessing wrong is expensive once rows
exist. All six were approved by the task owner before implementation.

| # | Decision | Chosen | Why |
|---|---|---|---|
| 1 | Tenant isolation | **RLS policies, in the same migration as the table** | An application-layer `where workspace_id = ?` must be remembered on every query by four people forever. One omission leaks a seller's catalogue. Resolves Open Decision #4. |
| 2 | `seller_id` on products | **Stored, with a composite FK** `(workspace_id, seller_id) → workspaces (id, seller_id)` | Keeps tenant filters join-free while making drift impossible — the database rejects any pair that is not a real workspace. |
| 3 | `inventory_state` | **Generated column** | The contract carries `state`, `quantityOnHand` and `lowStockThreshold`. A writable `state` is a second source of truth for stock and will eventually contradict the quantity. "Inventory has one source of truth" is a project invariant. |
| 4 | Options and images | **Options as `jsonb` on products; images deferred** | Options are capped at 3 and never queried independently, so a child table buys only joins. Images need their own table and task — so `image_id` is omitted from variants rather than pointing at a table that does not exist. |
| 5 | Uniqueness | **Slug unique per workspace (excluding archived); SKU unique per workspace (excluding null)** | Much harder to add once duplicate rows exist. Archived products release their slug for reuse. |
| 6 | Currency | **Explicit column, ISO-shape check, `PKR` default** | The contract is PKR-only today, but a USD Shopify store is a known open question (Open Decision #6). A column costs less now than a migration later; the shape check stops nonsense without hard-coding one currency. |

## 4. Migration files — one file, one responsibility

| File | Responsibility |
|---|---|
| `20260818100001_baseline_identity_and_workspaces.sql` | Records the three pre-existing tables so migrations and reality agree. Changes nothing. |
| `20260818100002_set_updated_at_function.sql` | Shared `set_updated_at()` trigger function. Infrastructure, used by every table from here on. |
| `20260818100003_workspaces_tenant_key.sql` | `unique (id, seller_id)` on workspaces — the target of the composite FK in decision 2. |
| `20260818100004_product_catalog_enums.sql` | `product_status`, `product_variant_status`, `inventory_state`. |
| `20260818100005_products_table.sql` | The products table, its constraints, indexes and trigger. |
| `20260818100006_product_variants_table.sql` | The variants table, its constraints, indexes and trigger. |
| `20260818100007_product_catalog_rls.sql` | RLS policies for both tables. |

Migrations are append-only. A mistake in a shipped migration is corrected by a new
migration, never by editing the old one — editing it would leave every machine that already
ran it in a different state from a fresh clone.

## 5. Named tests

Tier 2 (integration) — one real dependency, a Postgres instance. They do **not** run in the
default `npm run test`; they need Docker, and unit tests must need nothing.

**`packages/integrations/src/supabase/schema.itest.ts`**

| Test name | Asserts |
|---|---|
| `products table exists with contract columns` | every `productSchema` field has a column |
| `product_variants table exists with contract columns` | same for `productVariantSchema` |
| `product status enum matches the contract` | DB enum values == `productStatusValues` |
| `variant status enum matches the contract` | == `productVariantStatusValues` |
| `inventory state enum matches the contract` | == `inventoryStateValues` |
| `product rejects a blank title` | check constraint |
| `product rejects more than three options` | check constraint |
| `product rejects a workspace and seller that do not match` | composite FK — the tenant invariant |
| `product slug is unique per workspace` | partial unique index |
| `archived product releases its slug` | partial index excludes archived |
| `variant rejects a negative price` | check constraint |
| `variant sku is unique per workspace` | partial unique index |
| `variant inherits its product workspace` | composite FK |
| `inventory state is untracked when tracking is off` | generated column |
| `inventory state is out_of_stock at zero` | generated column |
| `inventory state is low_stock at or below threshold` | generated column |
| `inventory state is in_stock above threshold` | generated column |
| `inventory state cannot be written directly` | generated column is not writable |
| `updated_at changes on update` | trigger |

**`packages/integrations/src/supabase/rls.itest.ts`**

| Test name | Asserts |
|---|---|
| `seller reads only their own products` | the isolation invariant |
| `seller cannot read another seller's products` | |
| `seller cannot insert a product for another seller` | `with check` on insert |
| `seller cannot reassign a product to another seller` | `with check` on update |
| `seller cannot delete another seller's product` | |
| `seller reads only their own variants` | ownership inherited through products |
| `seller cannot insert a variant under another seller's product` | |
| `anonymous role reads nothing` | no policy grants anon access |

## 6. Definition of done

- `supabase db reset` builds the whole schema from migrations on a clean database
- Every test in §5 passes against it
- `database.types.ts` regenerated so the monorepo sees the new tables
- CI runs the integration tests against a real Postgres
- `PHASE-REGISTRY.md` complete, no `OPEN` blocker
