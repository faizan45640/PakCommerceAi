# Phase 2 — Product catalogue schema

## Gate 3 — Red

Verified properly, not assumed. With `0004`–`0007` moved out of `supabase/migrations/` and
the database reset from the baseline alone, the full suite ran:

```
 → relation "public.products" does not exist      (x27)
 Failed Tests 27
```

27/27 red because the schema under test genuinely did not exist — not a collection error,
not an import error, not a typo. The migrations were then restored, the database reset, and
the same 27 went green.

## Gate 5 — Green + aligned

Spec §3 decisions, checked clause by clause:

| Decision | Implemented as | Proved by |
|---|---|---|
| 2 — composite FK | `products_workspace_seller_fkey (workspace_id, seller_id) → workspaces (id, seller_id)` | `product rejects a workspace and seller that do not match` |
| 3 — generated state | `inventory_state ... generated always as (...) stored` | four state tests plus `inventory state cannot be written directly` |
| 4 — options as jsonb, images deferred | `options jsonb` + array/length checks; no `image_id` column | `product rejects more than three options` |
| 5 — uniqueness | partial unique indexes on `(workspace_id, slug)` and `(workspace_id, sku)` | `product slug is unique per workspace`, `archived product releases its slug`, `variant sku is unique per workspace` |
| 6 — currency | `price_currency text` + ISO-shape check, `PKR` default | column present; contract still pins PKR at the application boundary |

Enum values are asserted equal to the Zod contract rather than eyeballed, so adding a value
on one side without the other fails CI.

## Gate 7 — Scan

`eslint`, `tsc --noEmit`, and the production build are clean across all workspaces. No
`*.test.*` or `testing/` files reach `dist/`.
