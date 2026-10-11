# Order Contract

This package defines the application-level order contract for PakCommerce AI.
It is intentionally independent of Supabase row types, Shopify payloads, WooCommerce
payloads, or any future integration provider.

Orders depend on the product and inventory contracts. Line items reference
**variants**, not products. Confirming an order is the lifecycle event that
triggers inventory reservation/deduction (reason `sale`); drafts never touch stock.

## Field Ownership

- `sellerId` and `workspaceId` are mandatory on persisted orders.
- Client create/transition requests include `workspaceId`; `sellerId` must be
  derived by the backend from authenticated seller context.
- Money fields reuse the product contract's `moneySchema` (integer minor units, PKR).
- Customer identity on an order is a **snapshot** (name, phone, city, optional email).
  A future `customerId` link belongs to the Customer 360 contract (T-043+), not here.

## Status Values

Order lifecycle status is limited to:

- `draft`: created by a seller or AI; editable; **does not** reserve or deduct stock.
- `confirmed`: accepted for fulfillment; **triggers** stock reservation/deduction.
- `shipped`: handed to a courier / in transit.
- `delivered`: fulfilled at the customer.
- `cancelled`: terminal; abandoned before delivery.
- `returned`: terminal; returned after ship/delivery (inventory reason `return`).

UI mock labels such as `Pending` / `Confirmed` map onto these snake_case values;
they are display concerns, not a second vocabulary.

## Allowed Transitions

| From        | Allowed next statuses        |
|-------------|------------------------------|
| `draft`     | `confirmed`, `cancelled`     |
| `confirmed` | `shipped`, `cancelled`       |
| `shipped`   | `delivered`, `returned`      |
| `delivered` | `returned`                   |
| `cancelled` | _(none)_                     |
| `returned`  | _(none)_                     |

Illegal jumps (for example `draft → shipped` or `cancelled → confirmed`) must be
rejected by `canTransition` / `assertTransition` before any service logic runs.
Every successful transition appends an immutable status-history record.

## Draft vs Confirmed Rules

### Draft

- Created by the manual order form (T-040), draft/manual order API (T-036), or the
  AI `createDraftOrder` tool (T-041).
- AI write tools may **only** create drafts — never confirm or ship.
- Items are validated (variant exists, quantity ≥ 1, prices present) but stock is
  not checked or mutated.
- Seller may edit line items, customer snapshot, and cancel the draft.
- Drafts do not contribute to `reservedQuantity`.

### Confirmed

- Only a seller (or an approved human-in-the-loop action) may transition
  `draft → confirmed`.
- Confirmation is the stock event: backend service (T-037) must run inside a
  transaction with the no-negative-stock guard and write a `sale` movement.
- After confirm, line-item quantities and unit prices are frozen for audit; further
  commercial changes require cancel/return flows, not silent edits.
- Failure to allocate stock leaves the order in `draft` (or rejects the
  transition); the contract never allows a confirmed order with unmet stock.

## Channels

MVP channel values:

- `whatsapp`
- `shopify`
- `woocommerce`
- `instagram`
- `facebook`
- `manual`

Additional marketplaces (for example Daraz) are out of scope until a later contract bump.

## Status History

- Append-only. History rows are never edited or deleted.
- Each row records `fromStatus`, `toStatus`, actor, optional note, and timestamp.
- `fromStatus` / `toStatus` must be a legal pair from the transition table.

## Out of Scope

- Database migrations / `orders` tables (T-035)
- Express CRUD and stock deduction services (T-036, T-037)
- Dashboard UI wiring (T-038–T-040 already use mocks; connect later)
- Customer entity and `customerId` foreign key (T-043+)
- Courier assignment, COD risk, payments
