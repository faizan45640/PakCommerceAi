-- The products table.
--
-- Mirrors productSchema in packages/shared/src/products/index.ts. That contract
-- is the source of truth for shape; this file is the source of truth for
-- storage. A conformance test keeps them aligned.
--
-- Deliberately NOT here:
--   images    - a separate table in a follow-up task, so variants have no
--               image_id yet rather than a foreign key to nothing
--   options   - stored as jsonb on this table. The contract caps options at 3
--               and they are never queried independently of their product, so a
--               child table would buy joins and nothing else.

create table public.products (
  id uuid primary key default gen_random_uuid(),

  -- Tenancy. The composite foreign key below makes it impossible for these two
  -- to disagree with the workspace's real owner.
  workspace_id uuid not null,
  seller_id uuid not null,

  title text not null,
  slug text not null,
  description text,
  status public.product_status not null default 'draft',
  tags text[] not null default '{}',
  category_ids uuid[] not null default '{}',
  options jsonb not null default '[]'::jsonb,

  -- Backend-generated search document, never user-authored (products/README.md).
  search_text text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,

  constraint products_workspace_seller_fkey
    foreign key (workspace_id, seller_id)
    references public.workspaces (id, seller_id)
    on delete cascade,

  -- Lets product_variants declare a composite key on (product_id, workspace_id),
  -- so a variant cannot end up in a different workspace from its product.
  constraint products_id_workspace_id_key unique (id, workspace_id),

  -- Limits below mirror the Zod contract. Enforcing them here too means a direct
  -- SQL insert, a sync job or an admin client cannot write a row the application
  -- would consider invalid.
  constraint products_title_not_blank check (btrim(title) <> ''),
  constraint products_title_max_length check (char_length(title) <= 180),
  constraint products_slug_length check (char_length(slug) between 3 and 220),
  constraint products_tags_max check (cardinality(tags) <= 30),
  constraint products_category_ids_max check (cardinality(category_ids) <= 10),
  constraint products_options_is_array check (jsonb_typeof(options) = 'array'),
  constraint products_options_max check (jsonb_array_length(options) <= 3),
  constraint products_search_text_max_length check (char_length(search_text) <= 2000)
);

-- Slug is the seller-facing identifier, unique within a workspace. Archived
-- products are excluded so a slug can be reused after archiving.
create unique index products_workspace_slug_key
  on public.products (workspace_id, slug)
  where status <> 'archived';

-- Every tenant-scoped read filters on workspace_id first.
create index products_workspace_id_idx on public.products (workspace_id);
create index products_workspace_status_idx on public.products (workspace_id, status);
create index products_seller_id_idx on public.products (seller_id);
create index products_tags_idx on public.products using gin (tags);

create trigger products_set_updated_at
  before update on public.products
  for each row
  execute function public.set_updated_at();

comment on table public.products is
  'A sellable item. Stock and price live on product_variants, not here.';
comment on column public.products.search_text is
  'Backend-generated search document. Not user-authored.';
