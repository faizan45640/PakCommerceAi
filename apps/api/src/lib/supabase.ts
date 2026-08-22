import {
  assertSupabaseConfig,
  createSupabaseAdminClient,
  createSupabaseClient,
  createSupabaseUserClient,
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

export function createApiSupabaseUserClient(accessToken: string) {
  const config = getSupabaseConfigFromEnv();
  assertSupabaseConfig(config);

  return createSupabaseUserClient(config, accessToken);
}
