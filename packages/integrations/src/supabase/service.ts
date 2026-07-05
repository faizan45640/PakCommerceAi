import type { AppSupabaseClient } from "./client.js";
import {
  createSupabaseAdminClient,
  createSupabaseBrowserClient,
  createSupabaseClient,
} from "./client.js";
import { assertSupabaseConfig, getSupabaseConfigFromEnv } from "./config.js";
import type { SupabaseConfig } from "./types.js";

export class SupabaseService {
  readonly client: AppSupabaseClient;

  constructor(client: AppSupabaseClient) {
    this.client = client;
  }

  static fromConfig(config: SupabaseConfig): SupabaseService {
    return new SupabaseService(createSupabaseClient(config));
  }

  static fromEnv(): SupabaseService {
    const config = getSupabaseConfigFromEnv();
    assertSupabaseConfig(config);
    return SupabaseService.fromConfig(config);
  }

  static browserFromConfig(config: SupabaseConfig): SupabaseService {
    return new SupabaseService(createSupabaseBrowserClient(config));
  }

  static adminFromConfig(config: SupabaseConfig): SupabaseService {
    return new SupabaseService(createSupabaseAdminClient(config));
  }

  async healthCheck(): Promise<{ ok: true } | { ok: false; error: string }> {
    const { error } = await this.client.auth.getSession();

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true };
  }
}
