import {
  createSupabaseAdminClient,
  createSupabaseClient,
} from "@pakcommerce/integrations/supabase";

/**
 * Fixtures for tier-2 API tests.
 *
 * These drive the real Express app against the real local Supabase stack, with
 * real JWTs. Nothing about auth or RLS is mocked - a test that stubbed either
 * would prove nothing about the property being tested, since carrying the token
 * to Postgres correctly *is* the feature.
 *
 * The keys below are the published local development keys. They are identical on
 * every `supabase start` anywhere in the world, only valid against 127.0.0.1, and
 * documented by Supabase. They are not secrets. Real keys live in .env.
 */

export const LOCAL_SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";

export const LOCAL_ANON_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export const LOCAL_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

/** `authenticate` reads these, so they must be set before the app handles a request. */
export function applyTestEnv(): void {
  process.env.SUPABASE_URL = LOCAL_SUPABASE_URL;
  process.env.SUPABASE_PUBLISHABLE_KEY = LOCAL_ANON_KEY;
}

export interface TestSeller {
  userId: string;
  sellerId: string;
  workspaceId: string;
  accessToken: string;
}

/**
 * Service-role client: bypasses RLS, so it can arrange fixtures the seller
 * themselves could not create. Only ever used for setup and teardown - never to
 * assert something the API is supposed to enforce, which would test nothing.
 */
const admin = () =>
  createSupabaseAdminClient({
    url: LOCAL_SUPABASE_URL,
    anonKey: LOCAL_ANON_KEY,
    serviceRoleKey: LOCAL_SERVICE_ROLE_KEY,
  });

/**
 * Creates a signed-in seller with a workspace, and returns a real access token.
 *
 * `handle_new_user()` fires on the auth.users insert and creates the profile,
 * the seller profile and the default workspace from signup metadata. So this
 * UPDATES those rows into deterministic fixture values rather than inserting
 * them - a second insert would violate their primary keys.
 */
export async function createTestSeller(label: string): Promise<TestSeller> {
  const service = admin();
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@pakcommerce.test`;
  const password = "test-password-123";

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    throw new Error(`could not create test user: ${createError?.message}`);
  }

  const userId = created.user.id;
  const slug = `${label}-${userId.slice(0, 8)}`;

  const { error: profileError } = await service
    .from("profiles")
    .update({ full_name: label })
    .eq("id", userId);
  if (profileError) throw new Error(`profile update failed: ${profileError.message}`);

  const { error: sellerError } = await service
    .from("seller_profiles")
    .update({ business_name: `${label} Traders`, slug })
    .eq("id", userId);
  if (sellerError) throw new Error(`seller update failed: ${sellerError.message}`);

  // Created by the signup trigger, not by this helper.
  const { data: workspace, error: workspaceError } = await service
    .from("workspaces")
    .select("id")
    .eq("seller_id", userId)
    .eq("is_default", true)
    .single();
  if (workspaceError || !workspace) {
    throw new Error(`default workspace missing: ${workspaceError?.message}`);
  }

  const anon = createSupabaseClient({ url: LOCAL_SUPABASE_URL, anonKey: LOCAL_ANON_KEY });
  const { data: session, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !session.session) {
    throw new Error(`sign-in failed: ${signInError?.message}`);
  }

  return {
    userId,
    sellerId: userId,
    workspaceId: workspace.id,
    accessToken: session.session.access_token,
  };
}

/**
 * Removes a test seller and everything below them.
 *
 * These tests write through HTTP, so they cannot be wrapped in a transaction the
 * way the database tests are. Deleting the auth user cascades:
 * auth.users -> profiles -> seller_profiles -> workspaces -> products -> variants.
 */
export async function deleteTestSeller(seller: TestSeller): Promise<void> {
  await admin().auth.admin.deleteUser(seller.userId);
}

/** A minimal contract-valid create payload. */
export function productPayload(workspaceId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId,
    title: "Lawn Kurta",
    variants: [{ title: "Medium", price: { amountMinor: 250000 } }],
    ...overrides,
  };
}
