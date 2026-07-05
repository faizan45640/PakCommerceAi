import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database, SupabaseConfig } from "./types.js";

export type AppSupabaseClient = SupabaseClient<Database>;

export function createSupabaseClient(config: SupabaseConfig): AppSupabaseClient {
  return createClient<Database>(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createSupabaseAdminClient(config: SupabaseConfig): AppSupabaseClient {
  if (!config.serviceRoleKey) {
    throw new Error(
      "Supabase admin client requires SUPABASE_SERVICE_ROLE_KEY (server-side only).",
    );
  }

  return createClient<Database>(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createSupabaseBrowserClient(
  config: SupabaseConfig,
): AppSupabaseClient {
  return createClient<Database>(config.url, config.anonKey);
}
