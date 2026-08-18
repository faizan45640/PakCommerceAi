import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assertSupabaseConfig, getSupabaseConfigFromEnv } from "./config.js";

const MANAGED_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CUSTOM_SUPABASE_URL",
  "CUSTOM_SUPABASE_KEY",
];

const URL = "https://example.supabase.co";

let saved: Record<string, string | undefined>;

// These read process.env directly, so every case starts from a known-empty
// environment. Without this, test order would change results.
beforeEach(() => {
  saved = {};
  for (const key of MANAGED_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of MANAGED_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
});

describe("getSupabaseConfigFromEnv", () => {
  it("returns null when url is missing", () => {
    process.env.SUPABASE_PUBLISHABLE_KEY = "publishable";

    expect(getSupabaseConfigFromEnv()).toBeNull();
  });

  it("returns null when key is missing", () => {
    process.env.SUPABASE_URL = URL;

    expect(getSupabaseConfigFromEnv()).toBeNull();
  });

  it("returns null when url is whitespace only", () => {
    process.env.SUPABASE_URL = "   ";
    process.env.SUPABASE_PUBLISHABLE_KEY = "publishable";

    expect(getSupabaseConfigFromEnv()).toBeNull();
  });

  it("resolves publishable key", () => {
    process.env.SUPABASE_URL = URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = "publishable";

    expect(getSupabaseConfigFromEnv()).toEqual({ url: URL, anonKey: "publishable" });
  });

  it("falls back to anon key for compatibility", () => {
    // docs/supabase-setup.md promises SUPABASE_ANON_KEY still works.
    process.env.SUPABASE_URL = URL;
    process.env.SUPABASE_ANON_KEY = "anon";

    expect(getSupabaseConfigFromEnv()?.anonKey).toBe("anon");
  });

  it("prefers publishable key over anon key", () => {
    process.env.SUPABASE_URL = URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = "publishable";
    process.env.SUPABASE_ANON_KEY = "anon";

    expect(getSupabaseConfigFromEnv()?.anonKey).toBe("publishable");
  });

  it("omits service role key when absent", () => {
    process.env.SUPABASE_URL = URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = "publishable";

    // Absent, not present-and-undefined — the admin client checks truthiness.
    expect(getSupabaseConfigFromEnv()).not.toHaveProperty("serviceRoleKey");
  });

  it("includes service role key when present", () => {
    process.env.SUPABASE_URL = URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = "publishable";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";

    expect(getSupabaseConfigFromEnv()?.serviceRoleKey).toBe("service-role");
  });

  it("honours custom env key names", () => {
    process.env.CUSTOM_SUPABASE_URL = URL;
    process.env.CUSTOM_SUPABASE_KEY = "custom";

    const config = getSupabaseConfigFromEnv({
      urlKey: "CUSTOM_SUPABASE_URL",
      anonKeyKey: "CUSTOM_SUPABASE_KEY",
    });

    expect(config).toEqual({ url: URL, anonKey: "custom" });
  });
});

describe("assertSupabaseConfig", () => {
  it("assert throws on null config", () => {
    expect(() => assertSupabaseConfig(null)).toThrowError(
      /SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY/,
    );
  });

  it("assert narrows a valid config", () => {
    expect(() => assertSupabaseConfig({ url: URL, anonKey: "publishable" })).not.toThrow();
  });
});
