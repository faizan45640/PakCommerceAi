/**
 * The schema document the copilot is given so it writes correct SQL.
 *
 * Why this exists: queryDatabase lets the model write SQL, and a model that
 * cannot see the schema will invent column names (title vs product_name) and
 * then fail, guess again, fail again. Giving it the real schema is the single
 * highest-impact accuracy fix for text-to-SQL (Vercel's own agent work and the
 * text-to-SQL literature both land on this).
 *
 * Where this comes from: the migrations in supabase/migrations/. This is a
 * hand-written summary, NOT a generated artifact, because the model reads it as
 * prose and needs the *semantics* (money is integer paisa, inventory_state is
 * generated) — a raw `information_schema` dump would not carry those rules.
 *
 * Keep it honest: when a migration changes the schema, update this document and
 * the drift-guard test in schema-document.test.ts will remind you. The model
 * must never be told about a column that does not exist.
 */

export const SCHEMA_DOCUMENT = `PakCommerce AI database schema (PostgreSQL, public schema).

All money is stored as INTEGER MINOR UNITS (paisa), never a float: 250000 means Rs 2,500.
Every table is RLS-scoped to the seller: you see only the calling seller's rows,
so never add a seller_id or seller filter to a query - the database does that.

Tables:

profiles
  id uuid (PK, = auth user id), full_name text, phone text, avatar_url text,
  created_at timestamptz, updated_at timestamptz

seller_profiles
  id uuid (PK, = auth user id), business_name text, slug text, description text,
  business_phone text, business_email text, logo_url text,
  verification_status enum(pending|verified|rejected|suspended), verification_notes text,
  verified_at timestamptz, created_at timestamptz, updated_at timestamptz

workspaces
  id uuid (PK), seller_id uuid, name text, slug text,
  status enum(active|archived), is_default boolean,
  created_at timestamptz, updated_at timestamptz, archived_at timestamptz

products
  id uuid (PK), workspace_id uuid, seller_id uuid, title text, slug text,
  description text, status enum(draft|active|archived), tags text[], category_ids uuid[],
  options jsonb, search_text text, created_at timestamptz, updated_at timestamptz,
  archived_at timestamptz
  Note: price and stock live on product_variants, NOT here. Join through
  product_variants (products.id = product_variants.product_id).

product_variants
  id uuid (PK), product_id uuid, workspace_id uuid, title text, sku text, barcode text,
  status enum(active|inactive),
  price_amount_minor integer (paisa, NOT NULL), price_currency text (default 'PKR'),
  compare_at_price_amount_minor integer, compare_at_price_currency text,
  option_values jsonb, track_inventory boolean (default true),
  quantity_on_hand integer, low_stock_threshold integer,
  inventory_state enum(in_stock|low_stock|out_of_stock|untracked) GENERATED - do not filter/write it, filter the inputs:
    untracked when not track_inventory or quantity_on_hand is null,
    out_of_stock when quantity_on_hand <= 0,
    low_stock when low_stock_threshold is not null and quantity_on_hand <= low_stock_threshold,
    else in_stock.
  position integer, created_at timestamptz, updated_at timestamptz

product_list_view (a view, read-only, one row per product with rolled-up variant facts)
  id, workspace_id, seller_id, title, slug, description, status, tags, category_ids,
  search_text, created_at, updated_at, archived_at,
  variant_count bigint, min_price_amount_minor integer, max_price_amount_minor integer,
  price_currency text, total_quantity_on_hand bigint, variant_states text[]
  Use this view for catalogue questions: it already aggregates price range,
  stock total and variant states per product, so you rarely need to join.

Common queries:
- Product catalogue with prices: SELECT p.title, v.price_amount_minor FROM products p JOIN product_variants v ON v.product_id = p.id
- Aggregated catalogue (price range, stock, variant count): SELECT * FROM product_list_view
- Out-of-stock: SELECT p.title FROM products p JOIN product_variants v ON v.product_id = p.id WHERE v.inventory_state = 'out_of_stock'`;

/**
 * Tables a seller can query. Kept in sync with the migrations; used by the
 * getSchema tool to answer "which tables/columns exist" at runtime.
 */
export const QUERYABLE_TABLES = [
  "profiles",
  "seller_profiles",
  "workspaces",
  "products",
  "product_variants",
  "product_list_view",
] as const;
