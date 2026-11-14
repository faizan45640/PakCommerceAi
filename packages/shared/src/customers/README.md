# Customer Contract

Customer 360 for PakCommerce AI: who a customer is, what they have spent, how
they have behaved, and what happened with them. Independent of Supabase row
types and of any channel (WhatsApp, Shopify, ...).

Import from `@pakcommerce/shared/customers` (runtime values) or the package root.

## Identity

A customer is **one real person per workspace**, identified by their
**normalised phone number**. `normalizePhone` (Pakistan rules, in
`phone.ts`) is mirrored by the SQL function `public.normalize_phone(text)`
that links orders to customers. Both are checked against one shared table,
`phoneNormalizationFixtures`, so they cannot drift.

| Input | Result |
|---|---|
| `0300-1234567`, `03001234567`, `3001234567`, `923001234567`, `00923001234567`, `+92 300 1234567` | `+923001234567` |
| `+1 (415) 555-2671`, `0014155552671` | `+14155552671` |
| `4155552671` (not a Pakistani pattern, no `+`) | `4155552671` |
| no digits | `""` (unusable) |

Email is stored lower-cased and searchable. It is used for matching only when an
order has no usable phone. Phone always wins.

## Shapes

- `customerSchema`: `id, workspaceId, sellerId, name, phone, email?, city,
  addressLine?, createdAt, updatedAt`. Name, city, address and email are the
  latest values seen on the customer's orders; orders keep their own snapshot.
- `customerSummarySchema`: computed from orders, never stored.
  `lifetimeSpend`, `averageOrderValue | null`, `totalOrderCount`,
  `completedOrderCount`, `statusCounts` (one count per order status),
  `firstOrderAt`, `lastOrderAt`, `noteCount`, `riskNoteCount`.
  Money is PKR minor units like `moneySchema`, but sums may exceed one order's
  cap, so `customerMoneySchema` only requires a safe integer.
- `customerListItemSchema` = customer + `summary` + `tags`.
- `customerDetailSchema` = list item + `recentOrders` (last 20 `OrderListItem`)
  + `notes` + `timeline`.
- `customerNoteSchema` / `createCustomerNoteInputSchema`: kind `note | risk`,
  body 1-2000 characters.
- `customerSearchQuerySchema`: `workspaceId, query, tags[], sort, limit, cursor`.
- `customerTimelineEventSchema`: discriminated on `type`.

## Spend rule

**Lifetime spend** is the sum of order totals in `confirmed`, `shipped` or
`delivered` ("completed"). Drafts, cancelled and returned orders are excluded.
`averageOrderValue` is the mean over completed orders.

## Tags

Derived by `deriveCustomerTags`, never stored. A customer can have several.

| Tag | Meaning |
|---|---|
| `new` | no completed orders |
| `repeat` | two or more completed orders |
| `has_returns` | at least one returned order |
| `flagged` | at least one risk note |

Filtering by several tags in a search requires all of them.

## Timeline

Newest first, capped at 50 (`CUSTOMER_TIMELINE_LIMIT`). Derived from order
status history and notes:

- `order_status_changed`: `{ orderId, fromStatus | null, toStatus, note, at }`
  (`fromStatus` is null on the initial draft creation).
- `note_added`: `{ noteId, kind, body, at }`.

Later kinds (for example conversation events) are new union members.

## Sorting

`last_order_desc` (default), `spend_desc`, `name_asc`, `created_desc`.
`limit` 1-100 (default 25); `cursor` is opaque, like orders.
