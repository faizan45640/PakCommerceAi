-- The order_status_history table: one row per status change.
--
-- Mirrors orderStatusHistorySchema in packages/shared/src/orders/index.ts.
--
-- APPEND-ONLY. A history row is a fact about the past. Corrections are new
-- transitions, never edits to old rows. Enforced three ways:
--   1. authenticated is granted SELECT and INSERT only
--   2. there are no UPDATE or DELETE policies
--   3. a trigger refuses UPDATE for every role

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),

  order_id uuid not null,
  workspace_id uuid not null,
  seller_id uuid not null,

  -- Null only on the initial create-as-draft row.
  from_status public.order_status,
  to_status public.order_status not null,

  -- The signed-in user who made the change. For a seller acting on their own
  -- shop this equals seller_id; kept separate because an AI agent or staff
  -- account may act for the seller later.
  performed_by uuid references auth.users (id),

  note text,

  -- clock_timestamp(), not now(). now() is frozen at the start of the
  -- transaction, so several history rows written together would share one
  -- timestamp and their order would be lost.
  created_at timestamptz not null default clock_timestamp(),

  constraint order_status_history_workspace_seller_fkey
    foreign key (workspace_id, seller_id)
    references public.workspaces (id, seller_id)
    on delete cascade,

  constraint order_status_history_order_workspace_fkey
    foreign key (order_id, workspace_id)
    references public.orders (id, workspace_id)
    on delete cascade,

  constraint order_status_history_note_max_length
    check (note is null or char_length(note) <= 500),

  -- Initial row must create a draft; every other row must be a legal jump.
  constraint order_status_history_transition_legal check (
    (from_status is null and to_status = 'draft')
    or (
      from_status is not null
      and public.is_allowed_order_status_transition(from_status, to_status)
    )
  )
);

create index order_status_history_order_created_idx
  on public.order_status_history (order_id, created_at desc);
create index order_status_history_workspace_created_idx
  on public.order_status_history (workspace_id, created_at desc);
create index order_status_history_seller_id_idx
  on public.order_status_history (seller_id);

create function public.reject_order_status_history_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'order_status_history is append-only: record a new transition instead of editing one'
    using errcode = 'restrict_violation';
end;
$$;

comment on function public.reject_order_status_history_update() is
  'Trigger function. Refuses any UPDATE on order_status_history, for every role.';

revoke execute on function public.reject_order_status_history_update()
  from public, anon, authenticated;

-- UPDATE only. A DELETE trigger would also block the workspace cascade above;
-- clients are kept from deleting by having no DELETE privilege at all.
create trigger order_status_history_reject_update
  before update on public.order_status_history
  for each row
  execute function public.reject_order_status_history_update();

comment on table public.order_status_history is
  'Append-only history of order status changes. Never edited or deleted.';
comment on column public.order_status_history.from_status is
  'Null only for the initial draft-creation row.';
comment on column public.order_status_history.performed_by is
  'The authenticated user who made the change. Checked against auth.uid() on insert.';
