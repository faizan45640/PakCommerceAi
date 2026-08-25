# Inventory Contract

This package defines the application-level inventory contract for PakCommerce AI.
It is intentionally independent of Supabase row types, Shopify payloads, WooCommerce
payloads, or any future integration provider.

Inventory is tracked at the **variant level**, matching the product contract's rule
that SKUs and stock belong to product variants, not products.

## Field Ownership

- `sellerId` and `workspaceId` are mandatory on persisted inventory records.
- Client mutation requests include `workspaceId`; `sellerId` must be derived by the backend from authenticated seller context.
- Stock counts are non-negative integers. Fractional or negative stock values are invalid input, never clamped silently.

## Stock Math

The contract distinguishes three quantities per variant:

- `quantityOnHand`: physical units actually present.
- `reservedQuantity`: units allocated to confirmed-but-unfulfilled orders; a subset of on-hand.
- `availableQuantity`: derived, never stored: `quantityOnHand - reservedQuantity`.

Rules:

- `reservedQuantity` can never exceed `quantityOnHand`.
- Stock adjustments must never drive `quantityOnHand` below zero (no-negative-stock guard). The guard lives in the backend service; the contract's validation schemas reject negative results as well.
- `availableQuantity` is what selling workflows may promise to customers.

## Low-Stock Rule

Stock state reuses the product contract's `inventoryStateValues` — no duplicate vocabulary:

- `in_stock`: available quantity is above the low-stock threshold.
- `low_stock`: available quantity is greater than zero and at or below the threshold.
- `out_of_stock`: available quantity is zero.
- `untracked`: the variant does not track inventory (`trackInventory: false`).

`lowStockThreshold` is optional per variant. When absent, the state is derived from availability alone (zero is `out_of_stock`, otherwise `in_stock`); UI low-stock badges do not apply.

## Stock Movement Reasons

Every stock change produces an immutable movement record with exactly one reason from a closed list:

- `purchase`: stock received from a supplier.
- `sale`: stock deducted by an order confirmation.
- `return`: stock returned by a customer back into available stock.
- `manual_adjustment`: seller-corrected count via the stock adjustment dialog.
- `correction`: system or integration sync reconciliation.
- `damage_loss`: shrinkage, damage, or expiry write-off.

## Stock Adjustments

- Adjustment callers state the **new on-hand total** (`targetQuantityOnHand`), not a delta. This matches the stock adjustment dialog's before/after preview and the copilot `update-stock` tool's set semantics.
- The backend derives the movement delta from current state and writes the matching movement record; callers never send deltas.
- Because targets are non-negative integers, an adjustment that would drive stock below zero is rejected at validation time, before any service logic runs.
- A reason from the closed movement-reasons list is mandatory on every adjustment.

## Movement Immutability

- Movement records are append-only history. They are never edited or deleted.
- Each record snapshots `beforeQuantityOnHand`, `afterQuantityOnHand`, the delta, the acting user, and an optional note.
- Movement history is the audit trail behind T-033 QA scenarios; it must be reconstructible in order.

## Untracked Variants

Variants with `trackInventory: false` have no inventory row and never produce movements. Selling them does not consume or check stock. The AI `checkInventory` tool must report such variants as `untracked`, not as zero stock.
