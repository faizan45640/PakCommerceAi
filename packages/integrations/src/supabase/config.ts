import type { SupabaseConfig, SupabaseEnvOptions } from "./types.js";

const DEFAULT_ENV_KEYS = {
  urlKey: "SUPABASE_URL",
  anonKeyKey: "SUPABASE_ANON_KEY",
  serviceRoleKeyKey: "SUPABASE_SERVICE_ROLE_KEY",
} as const;

function readEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value || undefined;
}

export function getSupabaseConfigFromEnv(
  options: SupabaseEnvOptions = {},
): SupabaseConfig | null {
  const keys = { ...DEFAULT_ENV_KEYS, ...options };
  const url = readEnv(keys.urlKey);
  const anonKey = readEnv(keys.anonKeyKey);

  if (!url || !anonKey) {
    return null;
  }

  const serviceRoleKey = readEnv(keys.serviceRoleKeyKey);

  return {
    url,
    anonKey,
    ...(serviceRoleKey ? { serviceRoleKey } : {}),
  };
}

export function assertSupabaseConfig(
  config: SupabaseConfig | null,
): asserts config is SupabaseConfig {
  if (!config) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.",
    );
  }
}
