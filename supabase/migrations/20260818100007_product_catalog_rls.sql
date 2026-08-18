-- Access control for the product catalogue: table privileges and RLS policies.
--
-- "Every resource belongs to exactly one seller" is a project invariant, and
-- until now nothing enforced it. These are the first RLS policies in the
-- project; they set the pattern for every table that follows.
--
-- Why the database and not the application: an application-layer
-- `where workspace_id = ?` has to be remembered on every query, by four people,
-- forever. One forgotten filter leaks one seller's catalogue to another. A
-- policy cannot be forgotten - it applies to every query on the connection.
--
-- How a seller is identified: seller_profiles.id IS profiles.id IS auth.users.id,
-- so auth.uid() resolves straight to a seller id with no lookup.
--
-- auth.uid() is wrapped in a scalar subselect so Postgres evaluates it once per
-- query rather than once per row.
--
-- The service-role key bypasses RLS by design. That is why it is server-only.

-- Privileges first. A policy decides WHICH rows a role may touch; a grant decides
-- whether the role may touch the table at all. Without the grant, PostgREST gets
-- "permission denied for table products" and the policies never even run - which
-- is exactly what the first run of the RLS tests reported.
--
-- `anon` is deliberately granted nothing. The catalogue is seller-facing, and a
-- logged-out request has no business reading it. That makes two independent
-- barriers for anonymous access: no privilege, and no policy.

grant select, insert, update, delete on public.products to authenticated, service_role;
grant select, insert, update, delete on public.product_variants to authenticated, service_role;

alter table public.products enable row level security;
alter table public.product_variants enable row level security;

-- Policies are split per command rather than using FOR ALL, so that a future
-- change (say, allowing a partner read-only access) alters one policy instead
-- of widening everything at once.

create policy products_select_own
  on public.products for select to authenticated
  using (seller_id = (select auth.uid()));

create policy products_insert_own
  on public.products for insert to authenticated
  with check (seller_id = (select auth.uid()));

-- USING decides which rows may be updated; WITH CHECK decides what they may
-- become. Both are needed, or a seller could reassign a row to someone else.
create policy products_update_own
  on public.products for update to authenticated
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));

create policy products_delete_own
  on public.products for delete to authenticated
  using (seller_id = (select auth.uid()));

-- Variants inherit ownership from their product. They carry workspace_id but not
-- seller_id, so the check goes through products - which the composite foreign key
-- guarantees is the real parent.

create policy product_variants_select_own
  on public.product_variants for select to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
        and p.seller_id = (select auth.uid())
    )
  );

create policy product_variants_insert_own
  on public.product_variants for insert to authenticated
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
        and p.seller_id = (select auth.uid())
    )
  );

create policy product_variants_update_own
  on public.product_variants for update to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
        and p.seller_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
        and p.seller_id = (select auth.uid())
    )
  );

create policy product_variants_delete_own
  on public.product_variants for delete to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
        and p.seller_id = (select auth.uid())
    )
  );
