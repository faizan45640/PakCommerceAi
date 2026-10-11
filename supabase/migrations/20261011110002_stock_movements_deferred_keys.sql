-- Corrects two foreign keys on stock_movements (added in 20261011100003) so
-- that closing a seller's account, or removing a workspace, is not blocked by
-- its own stock history.
--
-- WHAT WAS WRONG. Both keys were plain NO ACTION, on the reasoning that the
-- check runs "once the statement has finished", by which time the workspace
-- cascade has removed the movements. That is not how Postgres orders it. A
-- cascade is carried out by nested statements, and a non-deferred NO ACTION
-- check fires at the end of whichever nested statement removed the referenced
-- row. Deleting a workspace cascades to products, then to variants, and the
-- variant check runs there and then - before the workspace's own cascade to
-- stock_movements has had its turn. The same happens with performed_by when an
-- auth user is deleted. So the first seller with any stock history could never
-- be removed. Nothing wrote movements until adjust_stock() existed, which is
-- why no test caught it.
--
-- THE FIX. Defer both checks to the end of the transaction. By then every
-- cascade has run, so:
--   - removing a workspace or an account takes its movements with it, and passes
--   - deleting a variant or product on its own still fails, at commit, because
--     its movements are still there - history is still protected
--   - deleting a user who performed movements in a workspace that survives
--     still fails, which is right: the history must keep its author
--
-- A separate migration rather than an edit to the original: migrations are
-- append-only once shared.

alter table public.stock_movements
  alter constraint stock_movements_variant_fkey deferrable initially deferred;

alter table public.stock_movements
  alter constraint stock_movements_performed_by_fkey deferrable initially deferred;
