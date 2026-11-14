-- Access control for orders, order_items, and order_status_history.
--
-- Same pattern as the product catalogue: privileges first, then RLS. Seller
-- identity is auth.uid() (seller_profiles.id IS profiles.id IS auth.users.id).
--
-- anon is deliberately granted nothing. Orders are seller-facing.

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.orders to authenticated, service_role;
revoke all on public.orders from anon;

alter table public.orders enable row level security;

create policy orders_select_own
  on public.orders for select to authenticated
  using (seller_id = (select auth.uid()));

create policy orders_insert_own
  on public.orders for insert to authenticated
  with check (seller_id = (select auth.uid()));

create policy orders_update_own
  on public.orders for update to authenticated
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));

create policy orders_delete_own
  on public.orders for delete to authenticated
  using (seller_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- order_items
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.order_items to authenticated, service_role;
revoke all on public.order_items from anon;

alter table public.order_items enable row level security;

create policy order_items_select_own
  on public.order_items for select to authenticated
  using (seller_id = (select auth.uid()));

create policy order_items_insert_own
  on public.order_items for insert to authenticated
  with check (seller_id = (select auth.uid()));

create policy order_items_update_own
  on public.order_items for update to authenticated
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));

create policy order_items_delete_own
  on public.order_items for delete to authenticated
  using (seller_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- order_status_history (append-only)
-- ---------------------------------------------------------------------------

grant select, insert on public.order_status_history to authenticated;
grant select, insert, delete on public.order_status_history to service_role;
revoke all on public.order_status_history from anon;
revoke update, delete, truncate on public.order_status_history from authenticated;

alter table public.order_status_history enable row level security;

create policy order_status_history_select_own
  on public.order_status_history for select to authenticated
  using (seller_id = (select auth.uid()));

-- performed_by is checked, not trusted: it is the audit answer to "who did
-- this", so a seller must not be able to write someone else's id into it.
-- Null performed_by is allowed for system/agent rows written with service role;
-- authenticated inserts must set performed_by = auth.uid().
create policy order_status_history_insert_own
  on public.order_status_history for insert to authenticated
  with check (
    seller_id = (select auth.uid())
    and performed_by = (select auth.uid())
  );
