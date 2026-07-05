/**
 * Replace with generated types from Supabase CLI:
 * npx supabase gen types typescript --project-id <id> > packages/integrations/src/supabase/database.types.ts
 */
export type Database = Record<string, never>;

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

export interface SupabaseEnvOptions {
  urlKey?: string;
  anonKeyKey?: string;
  serviceRoleKeyKey?: string;
}
