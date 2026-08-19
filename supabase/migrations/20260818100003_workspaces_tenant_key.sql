-- Makes (id, seller_id) and (id) both addressable on workspaces.
--
-- Products carry BOTH workspace_id and seller_id, because the product contract
-- (packages/shared/src/products/index.ts) defines both and because filtering by
-- seller without a join is what keeps tenant checks cheap.
--
-- Storing seller_id twice normally invites drift: a product could claim seller A
-- while its workspace belongs to seller B, and tenant isolation would be broken
-- with no error anywhere. This unique constraint lets child tables declare a
-- COMPOSITE foreign key on (workspace_id, seller_id), so the database refuses
-- any row whose pair does not match a real workspace. Drift becomes impossible
-- rather than merely unlikely.
--
-- "Every resource belongs to exactly one seller" is a project invariant
-- (docs/PROJECT_CONTEXT.md). This is the constraint that enforces it.

alter table public.workspaces
  add constraint workspaces_id_seller_id_key unique (id, seller_id);
