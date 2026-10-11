-- Why a stock quantity changed.
--
-- Values mirror stockMovementReasonValues in packages/shared/src/inventory
-- exactly, in the same order. A conformance test asserts they stay in step.
--
-- A closed list rather than free text: "why did stock change" is the question
-- the movement history exists to answer, and a seller typing "sold", "Sale" and
-- "order" for the same thing makes it unanswerable.
--
-- Separate migration from the table so that adding a reason later (which needs
-- its own ALTER TYPE) has an obvious home.

create type public.stock_movement_reason as enum (
  'purchase',           -- stock received from a supplier
  'sale',               -- stock deducted by an order confirmation
  'return',             -- stock a customer sent back into available stock
  'manual_adjustment',  -- seller-corrected count
  'correction',         -- system or integration sync reconciliation
  'damage_loss'         -- shrinkage, damage or expiry write-off
);
