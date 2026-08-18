# Design Intent — `product-catalog`

Why this schema is shaped the way it is. Read this before extending it, so a gap gets
resolved the way this system is designed rather than the way such systems are usually built.

---

## The database is a participant, not a bucket

`packages/shared` already validates products with Zod. It would have been possible to create
two thin tables and let the application enforce everything.

That was rejected because the application is not the only writer. Phase 4 brings Shopify and
WooCommerce sync jobs. Phase 5 brings a WhatsApp agent creating draft orders. Beyond those
there are admin clients, one-off SQL fixes, and a service-role key that bypasses RLS
entirely. Every one of those paths can write a row that never passes through a Zod schema.

So limits that matter are expressed twice, on purpose: once in the contract, for good error
messages, and once as a constraint, because that one cannot be bypassed.

**When extending:** if a rule protects data integrity, put it in the database too. If it is
presentation or convenience, leave it in the contract.

## Two tables, because stock is not a product-level fact

A seller does not have "12 Lawn Kurtas". They have 5 medium, 4 large, 3 small. Price, SKU
and stock are variant-level facts, and `productSchema.variants` is `.min(1)` so even a simple
product has one variant.

**When extending:** anything a seller counts, prices or ships belongs on the variant.
Anything they describe belongs on the product.

## Tenant isolation is structural, not remembered

Three mechanisms, each covering a different failure:

1. **RLS policies** — cover a forgotten `where` clause. The database refuses the row.
2. **The composite foreign key** `(workspace_id, seller_id) → workspaces (id, seller_id)` —
   covers denormalised data drifting. There is no such thing as a product whose seller and
   workspace disagree; the constraint makes the state unrepresentable.
3. **`(product_id, workspace_id)` on variants** — covers a variant being attached to a
   product in a different workspace.

None of these depend on a developer remembering anything, which is the point. Four people
work on this repository, and code review does not reliably catch a missing filter.

**When extending:** a new table hanging off a workspace gets the same three treatments. A
table without an RLS policy is readable by every authenticated user.

## Derived data is derived, never stored

`inventory_state` is a generated column. The contract carries `state` alongside
`quantityOnHand` and `lowStockThreshold`, and a writable `state` column would be a second
source of truth for stock — it would eventually disagree with the quantity, and the
disagreement would surface as a customer buying something that is not there.

"Inventory has one source of truth" is a project invariant. This is where it is enforced.

**When extending:** if a value can be computed from other columns, generate it. Reach for a
stored copy only with a measured performance reason, and then own the job of keeping it true.

## Money is an integer

`price_amount_minor` is paisa, never rupees, never a float. Floating point money accumulates
rounding error, and the first place it shows up is a COD settlement that is off by one rupee
and nobody can explain.

Currency is a separate column with an ISO-shape check rather than a hard-coded `PKR`. The
contract is PKR-only today (Open Decision #6), but a USD-denominated Shopify store is a known
possibility and widening a check constraint later is cheaper than adding a column to a table
with rows in it.

## Migrations are append-only

A shipped migration is never edited. Everyone who already ran it would end up in a different
state from a fresh clone, and nothing would report the difference.

**When extending:** correct a mistake with a new migration. `supabase db reset` is the test —
if the schema does not rebuild from an empty database, the migrations are wrong regardless of
what your local database looks like.

## What was deliberately left out

| Left out | Why | When to add |
|---|---|---|
| `product_images` table | Its own task. A variant `image_id` pointing at a missing table would be worse than no column. | When the catalogue UI needs images |
| Options as a table | Capped at 3 by the contract and never queried independently — a child table buys joins and nothing else. | If options ever need to be searched or shared across products |
| `categories` table | `category_ids` is a uuid array today. Nothing defines a category yet. | When categories become a real entity |
| RLS on `profiles`, `seller_profiles`, `workspaces` | They predate this decision and changing them is not this task's scope. | Soon — they are the tables holding seller identity |
| Full-text search index | `search_text` exists and is populated by the backend, but no index yet. Adding one before there is a query to serve would be guessing at the shape. | When product search is implemented |
