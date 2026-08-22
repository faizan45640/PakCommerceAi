/**
 * Connection and fixture helpers for tier-2 (integration) database tests.
 *
 * These talk to a real Postgres — the local Supabase stack started by
 * `npx supabase start`. Nothing here is used by production code; it exists so
 * schema and RLS tests can be written without repeating setup in every file.
 *
 * Isolation strategy: every test runs inside a transaction that is always rolled
 * back. Tests therefore never see each other's rows and never need cleanup, and
 * the database is in the same state after the suite as before it.
 */

import { Client } from "pg";

/** Local Supabase Postgres. Never a deployed database. */
export const LOCAL_DATABASE_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export interface Seller {
  userId: string;
  sellerId: string;
  workspaceId: string;
}

export async function connect(): Promise<Client> {
  const client = new Client({ connectionString: LOCAL_DATABASE_URL });
  await client.connect();
  return client;
}

/**
 * Runs `body` inside a transaction and always rolls it back.
 *
 * Returns whatever `body` returns so a test can assert on it after the rollback.
 */
export async function withRollback<T>(
  client: Client,
  body: (client: Client) => Promise<T>,
): Promise<T> {
  await client.query("begin");
  try {
    return await body(client);
  } finally {
    await client.query("rollback");
  }
}

/**
 * Creates a full seller chain: auth user -> profile -> seller profile -> workspace.
 *
 * `seller_profiles.id` is `profiles.id` is `auth.users.id`, so the returned
 * `sellerId` and `userId` are the same value. Both are returned because the
 * tests read better when the intent is explicit.
 */
export async function createSeller(client: Client, label: string): Promise<Seller> {
  const {
    rows: [user],
  } = await client.query<{ id: string }>(
    // Only columns present in every gotrue schema version. Later versions add
    // email_confirmed_at and others; naming them would tie this suite to one CLI
    // version, and the four of us do not all upgrade on the same day. Nothing
    // here signs in - RLS tests set the JWT claim directly - so a minimal row is
    // enough.
    `insert into auth.users (id, aud, role, email, encrypted_password,
                             created_at, updated_at)
     values (gen_random_uuid(), 'authenticated', 'authenticated', $1, '',
             now(), now())
     returning id`,
    [`${label}@pakcommerce.test`],
  );

  // handle_new_user() fires on this insert and creates profiles,
  // seller_profiles, and the default workspace from signup-derived values.
  // Align them with the deterministic fixture names below instead of
  // inserting second rows (that would violate the primary keys).
  await client.query(`update public.profiles set full_name = $2 where id = $1`, [
    user.id,
    label,
  ]);

  await client.query(
    `update public.seller_profiles set business_name = $2, slug = $3 where id = $1`,
    [user.id, `${label} Traders`, `${label}-traders`],
  );

  // Do NOT insert a workspace here. Inserting the seller profile fires
  // seller_profiles_create_default_workspace, which creates one automatically -
  // that is production behaviour, and creating a second would make every
  // "reads only their own workspaces" assertion count two rows.
  const {
    rows: [workspace],
  } = await client.query<{ id: string }>(
    `select id from public.workspaces where seller_id = $1 and is_default`,
    [user.id],
  );

  return { userId: user.id, sellerId: user.id, workspaceId: workspace.id };
}

/** Inserts a product as the table owner, bypassing RLS. For arranging fixtures. */
export async function insertProduct(
  client: Client,
  seller: Seller,
  slug: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const {
    rows: [product],
  } = await client.query<{ id: string }>(
    `insert into public.products (workspace_id, seller_id, title, slug, status)
     values ($1, $2, $3, $4, coalesce($5, 'draft')::public.product_status)
     returning id`,
    [
      overrides.workspaceId ?? seller.workspaceId,
      overrides.sellerId ?? seller.sellerId,
      overrides.title ?? `Product ${slug}`,
      slug,
      overrides.status ?? null,
    ],
  );

  return product.id;
}

/**
 * Runs `body` as an authenticated Supabase user, so RLS policies apply and
 * `auth.uid()` returns `userId`.
 *
 * `set local` scopes both settings to the surrounding transaction, so the
 * connection is back to its normal role as soon as withRollback finishes.
 */
export async function asUser<T>(
  client: Client,
  userId: string,
  body: () => Promise<T>,
): Promise<T> {
  await client.query(`set local role authenticated`);
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);

  try {
    return await body();
  } finally {
    await restoreRole(client);
  }
}

/** Runs `body` as the anonymous (logged-out) Supabase role. */
export async function asAnon<T>(client: Client, body: () => Promise<T>): Promise<T> {
  await client.query(`set local role anon`);

  try {
    return await body();
  } finally {
    await restoreRole(client);
  }
}

/**
 * Restores the owning role, tolerating an aborted transaction.
 *
 * When the body failed - which is exactly what an RLS denial test expects - the
 * transaction is aborted and every further command errors with "current
 * transaction is aborted". Letting that escape would replace the RLS error the
 * test is asserting on with a meaningless one.
 */
async function restoreRole(client: Client): Promise<void> {
  try {
    await client.query(`set local role postgres`);
  } catch {
    // Transaction already aborted; withRollback will clean it up.
  }
}
