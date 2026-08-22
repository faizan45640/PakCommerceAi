-- Bootstrap seller identity when an auth user signs up.
--
-- Supabase Auth owns auth.users; our domain tables (profiles,
-- seller_profiles) must get matching rows the moment a user is created,
-- otherwise RLS policies keyed on profiles/seller_profiles have nothing
-- to match and the new seller sees nothing.
--
-- The function is SECURITY DEFINER because inserts happen in the context
-- of the auth flow (often the anonymous key), which has no grant to write
-- these tables directly.
--
-- Replaces the earlier manual handle_new_auth_user() (which only inserted
-- a profiles row) that was applied to some environments outside of
-- migrations. Dropped here so every database converges on this version.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_auth_user();
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

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
    base_slug := base_slug || '-store';
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

comment on function public.handle_new_user() is
  'Creates profiles and seller_profiles rows for each new auth.users entry. Business name and slug derive from signup metadata or email.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only Supabase Auth may fire this trigger; close the RPC surface.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;
