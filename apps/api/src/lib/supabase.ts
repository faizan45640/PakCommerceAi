import {
  assertSupabaseConfig,
  createSupabaseAdminClient,
  createSupabaseClient,
  getSupabaseConfigFromEnv,
} from "@pakcommerce/integrations/supabase";

export function createApiSupabaseClient() {
  const config = getSupabaseConfigFromEnv();
  assertSupabaseConfig(config);

  return createSupabaseClient(config);
}

export function createApiSupabaseAdminClient() {
  const config = getSupabaseConfigFromEnv();
  assertSupabaseConfig(config);

  return createSupabaseAdminClient(config);
}
