-- Enforce tenant composite foreign keys on categories and product_images,
-- and prevent registration failures when business names contain non-ASCII (e.g. Urdu) characters.
--
-- 1. TENANT COMPOSITE KEYS:
--    In 20260818100003_workspaces_tenant_key.sql, workspaces established unique (id, seller_id)
--    so child tables could guarantee that workspace_id and seller_id never disagree.
--    categories and product_images omitted this composite key, allowing tenant drift.
--    product_images also omitted foreign key (product_id, workspace_id) to products (id, workspace_id).
--    Drop redundant single-column foreign keys to prevent PostgREST embedding ambiguity (PGRST201).

alter table public.categories
  drop constraint if exists categories_workspace_id_fkey;

alter table public.categories
  add constraint categories_workspace_seller_fkey
  foreign key (workspace_id, seller_id)
  references public.workspaces (id, seller_id)
  on delete cascade;

alter table public.product_images
  drop constraint if exists product_images_product_id_fkey,
  drop constraint if exists product_images_workspace_id_fkey;

alter table public.product_images
  add constraint product_images_workspace_seller_fkey
  foreign key (workspace_id, seller_id)
  references public.workspaces (id, seller_id)
  on delete cascade;

alter table public.product_images
  add constraint product_images_product_workspace_fkey
  foreign key (product_id, workspace_id)
  references public.products (id, workspace_id)
  on delete cascade;

-- 2. URDU / NON-ASCII SIGNUP SLUG FIX:
--    When signup metadata contains an Urdu/Arabic business_name, regex replacement of
--    [^a-zA-Z0-9]+ collapses the entire string to empty (''). Previously, appending '-store'
--    produced '-store', whose leading hyphen violated the check constraint
--    seller_slug_format (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$').
--    Fix: if base_slug is empty, generate a clean alphanumeric fallback like 'store-xxxxxx'.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_text text;
  full_name_value text;
  base_slug text;
  candidate_slug text;
  business_name_value text;
begin
  full_name_value := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');
  if full_name_value is not null and char_length(full_name_value) < 2 then
    full_name_value := null;
  end if;

  insert into public.profiles (id, full_name)
  values (new.id, left(full_name_value, 100))
  on conflict (id) do nothing;

  source_text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'business_name'), ''),
    split_part(coalesce(new.email, 'seller'), '@', 1)
  );

  -- Slugify: lowercase, collapse non-alphanumerics to dashes, trim edges.
  base_slug := lower(regexp_replace(source_text, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);

  if char_length(base_slug) < 3 then
    base_slug := case
      when base_slug = '' then 'store-' || substr(md5(random()::text), 1, 6)
      else base_slug || '-store'
    end;
  end if;
  if char_length(base_slug) > 80 then
    base_slug := substr(base_slug, 1, 80);
  end if;

  candidate_slug := base_slug;
  while exists (
    select 1 from public.seller_profiles where slug = candidate_slug
  ) loop
    candidate_slug := left(base_slug, 75) || '-' || substr(md5(random()::text), 1, 4);
  end loop;

  business_name_value := left(source_text, 120);
  if char_length(business_name_value) < 2 then
    business_name_value := 'My Store';
  end if;

  insert into public.seller_profiles (id, business_name, slug)
  values (new.id, business_name_value, candidate_slug)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;
