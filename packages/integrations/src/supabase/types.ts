export type { Database } from "./database.types.js";

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
