# Product Contract

This package defines the application-level product contract for PakCommerce AI.
It is intentionally independent of Supabase row types, Shopify payloads, WooCommerce
payloads, or any future integration provider.

## Field Ownership

- `sellerId` and `workspaceId` are mandatory on persisted products.
- Client create requests include `workspaceId`; `sellerId` must be derived by the backend from authenticated seller context.
- Product prices use integer minor units in PKR to avoid floating-point money bugs.
- `searchText` is a backend-generated field, not user-authored content.

## Status Values

Product lifecycle status is limited to:

- `draft`: not ready for active selling.
- `active`: visible/usable in selling workflows.
- `archived`: retained for history but removed from normal selling flows.

Inventory state is separate from product lifecycle status. A product can be
`active` while one variant is `out_of_stock`.

## Variant Assumptions

- Every product has at least one variant, even if the seller thinks of it as a simple product.
- Products may have up to three option dimensions, such as size, color, and material.
- Variant SKUs, barcodes, prices, and inventory are variant-level fields.
- Provider-specific variant IDs belong in integration mapping tables, not in this shared contract.

## Image Handling

- Product images are URL metadata references. Binary upload/storage is handled elsewhere.
- At most one image can be primary.
- Variant images reference product image IDs when needed.
- External provider image IDs are optional metadata and should not be used as primary identifiers.

## Search Behavior

Product search may target title, slug, description, SKU, barcode, tags, variant
titles, and variant option values. The backend should decide the actual ranking
strategy and generated search document, while callers use `productSearchQuerySchema`
for filters, sort, pagination, and permitted search fields.
