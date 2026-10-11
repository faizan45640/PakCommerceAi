-- The stock_movements table: one row per change to a variant's quantity on hand.
--
-- Mirrors stockMovementSchema in packages/shared/src/inventory/index.ts.
--
-- product_variants says how much stock there is now. This table says how it got
-- there - what changed, by how much, why, and who did it. It is the audit trail
-- behind "important actions should be traceable" (docs/PROJECT_CONTEXT.md).
--
-- APPEND-ONLY. A movement is a fact about the past. A correction is a new
-- movement with reason 'correction', never an edit to an old one - otherwise the
-- history can be made to say anything. Enforced three ways, below:
--   1. authenticated is granted SELECT and INSERT only
--   2. there are no UPDATE or DELETE policies
--   3. a trigger refuses UPDATE for every role, including the ones that bypass
--      grants and RLS (the service-role key, a sync job, a hand-written fix)
--
-- This migration only stores movements. It does not apply them: nothing here
-- changes product_variants.quantity_on_hand. Writing the movement and the new
-- quantity together, atomically, belongs to the stock adjustment API.

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),

  variant_id uuid not null,
  -- Carried so "all movements for this product" needs no join. The composite
  -- key below guarantees it is the variant's real product.
  product_id uuid not null,

  -- Tenancy. Same pattern as products: both ids, and a composite key that makes
  -- it impossible for them to disagree with the workspace's real owner.
  workspace_id uuid not null,
  seller_id uuid not null,

  reason public.stock_movement_reason not null,

  -- Signed: positive adds stock, negative removes it.
  quantity_delta integer not null,
  -- Snapshots, so the history reads on its own without replaying every earlier
  -- movement to learn what the stock was at the time.
  before_quantity_on_hand integer not null,
  after_quantity_on_hand integer not null,

  -- The signed-in user who made the change. For a seller acting on their own
  -- shop this equals seller_id; it is a separate column because it will not
  -- always (a staff account, the WhatsApp agent acting for the seller).
  performed_by uuid not null references auth.users (id),

  note text,

  -- clock_timestamp(), not now(). now() is frozen at the start of the
  -- transaction, so several movements written together would share one
  -- timestamp and their order - which the contract requires to be
  -- reconstructible - would be lost.
  created_at timestamptz not null default clock_timestamp(),

  -- No updated_at: a row that cannot change has no use for one.

  constraint stock_movements_workspace_seller_fkey
    foreign key (workspace_id, seller_id)
    references public.workspaces (id, seller_id)
    on delete cascade,

  -- NO ACTION, deliberately not CASCADE. Deleting a variant (or its product) on
  -- its own would erase its stock history, so that is refused - the catalogue
  -- retires things by archiving them. Removing a whole workspace still works:
  -- the key above cascades the movements away in the same statement, and
  -- NO ACTION is only checked once the statement has finished.
  constraint stock_movements_variant_fkey
    foreign key (variant_id, product_id, workspace_id)
    references public.product_variants (id, product_id, workspace_id),

  -- The rules below mirror the Zod contract. Enforcing them here too means a
  -- sync job, an admin client or hand-written SQL cannot record a movement the
  -- application would consider invalid.
  constraint stock_movements_delta_not_zero check (quantity_delta <> 0),
  constraint stock_movements_before_non_negative check (before_quantity_on_hand >= 0),
  -- The no-negative-stock guard: a movement may not leave less than nothing.
  constraint stock_movements_after_non_negative check (after_quantity_on_hand >= 0),
  constraint stock_movements_quantities_consistent
    check (after_quantity_on_hand = before_quantity_on_hand + quantity_delta),
  constraint stock_movements_note_max_length check (note is null or char_length(note) <= 500)
);

-- "History of this variant, newest first" - the stock history panel.
create index stock_movements_variant_created_idx
  on public.stock_movements (variant_id, created_at desc);
-- "Everything that moved in this workspace, newest first".
create index stock_movements_workspace_created_idx
  on public.stock_movements (workspace_id, created_at desc);
create index stock_movements_product_id_idx on public.stock_movements (product_id);
create index stock_movements_seller_id_idx on public.stock_movements (seller_id);

create function public.reject_stock_movement_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'stock_movements is append-only: record a correcting movement instead of editing one'
    using errcode = 'restrict_violation';
end;
$$;

comment on function public.reject_stock_movement_update() is
  'Trigger function. Refuses any UPDATE on stock_movements, for every role.';

-- A trigger function is never called directly; nobody needs EXECUTE on it.
revoke execute on function public.reject_stock_movement_update() from public, anon, authenticated;

-- UPDATE only. A DELETE trigger would also block the workspace cascade above;
-- clients are kept from deleting by having no DELETE privilege at all.
create trigger stock_movements_reject_update
  before update on public.stock_movements
  for each row
  execute function public.reject_stock_movement_update();

comment on table public.stock_movements is
  'Append-only history of changes to a variant''s quantity on hand. Never edited or deleted.';
comment on column public.stock_movements.quantity_delta is
  'Signed change in units. after_quantity_on_hand = before_quantity_on_hand + quantity_delta.';
comment on column public.stock_movements.performed_by is
  'The authenticated user who made the change. Checked against auth.uid() on insert.';

-- Privileges, then policies. Supabase grants new tables to anon by default, so
-- the revoke is required or a logged-out request can reach the table.
grant select, insert on public.stock_movements to authenticated;
grant select, insert, delete on public.stock_movements to service_role;
revoke all on public.stock_movements from anon;
-- The same default grants hand authenticated every privilege, including the
-- UPDATE and DELETE this table must not have.
revoke update, delete, truncate on public.stock_movements from authenticated;

alter table public.stock_movements enable row level security;

create policy stock_movements_select_own
  on public.stock_movements for select to authenticated
  using (seller_id = (select auth.uid()));

-- performed_by is checked, not trusted: it is the audit answer to "who did
-- this", so a seller must not be able to write someone else's id into it.
create policy stock_movements_insert_own
  on public.stock_movements for insert to authenticated
  with check (
    seller_id = (select auth.uid())
    and performed_by = (select auth.uid())
  );
