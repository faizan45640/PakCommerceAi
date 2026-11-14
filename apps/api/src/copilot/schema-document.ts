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
  quantity_on_hand integer, reserved_quantity integer (default 0, units promised to unfulfilled orders),
  low_stock_threshold integer,
  inventory_state enum(in_stock|low_stock|out_of_stock|untracked) GENERATED - do not filter/write it, filter the inputs.
    Available stock = quantity_on_hand - reserved_quantity:
    untracked when not track_inventory or quantity_on_hand is null,
    out_of_stock when available <= 0,
    low_stock when low_stock_threshold is not null and available <= low_stock_threshold,
    else in_stock.
  position integer, created_at timestamptz, updated_at timestamptz

categories (hierarchical catalogue organisation; parent_id points at another category or is null)
  id uuid (PK), workspace_id uuid, seller_id uuid, parent_id uuid (nullable, self-reference),
  name text, slug text, description text (nullable),
  channel_mappings jsonb (default '{}', per-marketplace category ids),
  created_at timestamptz, updated_at timestamptz
  Note: unique on (workspace_id, slug).

product_images (cover/gallery photos for a product)
  id uuid (PK), product_id uuid, workspace_id uuid, seller_id uuid,
  url text, alt_text text (nullable), position integer (default 0),
  is_primary boolean (default false), source jsonb (nullable, provider metadata),
  created_at timestamptz, updated_at timestamptz

inventory (a view, read-only, one row per stock-tracked variant; untracked variants have no row)
  id (= variant_id), variant_id, product_id, seller_id, workspace_id, track_inventory,
  quantity_on_hand integer, reserved_quantity integer, available_quantity integer,
  low_stock_threshold integer, state enum(in_stock|low_stock|out_of_stock),
  created_at, updated_at
  Use this view for stock questions: it already computes available_quantity.

stock_movements (append-only history of stock changes; rows can never be edited or deleted)
  id uuid (PK), variant_id uuid, product_id uuid, workspace_id uuid, seller_id uuid,
  reason enum(purchase|sale|return|manual_adjustment|correction|damage_loss),
  quantity_delta integer (signed: positive adds stock, negative removes it),
  before_quantity_on_hand integer, after_quantity_on_hand integer,
  performed_by uuid, note text, created_at timestamptz

orders (a purchase; drafts do not touch stock — confirmation is the stock event)
  id uuid (PK), workspace_id uuid, seller_id uuid,
  status enum(draft|confirmed|shipped|delivered|cancelled|returned),
  channel enum(whatsapp|shopify|woocommerce|instagram|facebook|manual),
  payment_method enum(cod|prepaid) default 'cod',
  customer_name text, customer_phone text, customer_city text,
  customer_email text, customer_address_line text (required once confirmed),
  subtotal_amount_minor integer (= sum of line totals), shipping_fee_amount_minor integer,
  total_amount_minor integer (= subtotal + shipping), currency text (= 'PKR' only),
  note text, confirmed_at timestamptz, cancelled_at timestamptz,
  created_at timestamptz, updated_at timestamptz
  Note: insert as draft only (create_draft_order). Never UPDATE status /
  confirmed_at / cancelled_at directly — call transition_order_status.
  Until T-037 that RPC only allows draft→cancelled. Do not invent confirmation.

order_items (line snapshots on an order; mutable only while parent is draft)
  id uuid (PK), order_id uuid, product_id uuid, variant_id uuid,
  workspace_id uuid, seller_id uuid,
  title text, variant_title text, sku text,
  quantity integer (>0), unit_price_amount_minor integer,
  line_total_amount_minor integer (= quantity * unit_price), currency text (= 'PKR'),
  created_at timestamptz, updated_at timestamptz
  Note: frozen after the order leaves draft. Do not UPDATE/DELETE lines on
  confirmed/shipped/delivered/cancelled/returned orders.

order_status_history (append-only status changes; rows can never be edited)
  id uuid (PK), order_id uuid, workspace_id uuid, seller_id uuid,
  from_status enum(order_status) nullable (null only on the initial draft row),
  to_status enum(order_status),
  performed_by uuid, note text, created_at timestamptz
  Legal transitions: draft→confirmed|cancelled, confirmed→shipped|cancelled,
  shipped→delivered|returned, delivered→returned. Terminal: cancelled, returned.
  Transition rows are written only by transition_order_status — do not INSERT them.

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
- Out-of-stock: SELECT p.title FROM products p JOIN product_variants v ON v.product_id = p.id WHERE v.inventory_state = 'out_of_stock'
- Recent drafts: SELECT id, customer_name, total_amount_minor, channel, created_at FROM orders WHERE status = 'draft' ORDER BY created_at DESC
- Order with lines: SELECT o.id, oi.title, oi.quantity, oi.line_total_amount_minor FROM orders o JOIN order_items oi ON oi.order_id = o.id`;

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
  "product_images",
  "categories",
  "product_list_view",
  "inventory",
  "stock_movements",
  "orders",
  "order_items",
  "order_status_history",
] as const;
