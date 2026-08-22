import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSupabaseAdminClient,
  createSupabaseClient,
  createSupabaseUserClient,
} from "./client.js";

// The factories are wiring, so the behaviour worth pinning is *what they hand to
// supabase-js* — not whether supabase-js works. Mocking keeps this a tier-1 unit
// test with no network.
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ mocked: true })),
}));

const URL = "https://example.supabase.co";

beforeEach(() => {
  vi.mocked(createClient).mockClear();
});

describe("createSupabaseUserClient", () => {
  it("user client requires an access token", () => {
    expect(() =>
      createSupabaseUserClient({ url: URL, anonKey: "publishable" }, ""),
    ).toThrowError(/access token/);
  });

  it("user client sends the caller's JWT as the bearer token", () => {
    createSupabaseUserClient(
      { url: URL, anonKey: "publishable" },
      "user-jwt",
    );

    // The anon key authenticates the API connection; the bearer header is
    // what Postgres resolves to auth.uid() for RLS.
    expect(vi.mocked(createClient)).toHaveBeenCalledWith(URL, "publishable", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: "Bearer user-jwt" } },
    });
  });
});

describe("createSupabaseAdminClient", () => {
  it("admin client requires service role key", () => {
    expect(() => createSupabaseAdminClient({ url: URL, anonKey: "publishable" })).toThrowError(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
  });

  it("admin client builds with service role key", () => {
    createSupabaseAdminClient({
      url: URL,
      anonKey: "publishable",
      serviceRoleKey: "service-role",
    });

    // It must use the service-role key, never the publishable one.
    expect(vi.mocked(createClient)).toHaveBeenCalledWith(
      URL,
      "service-role",
      expect.anything(),
    );
  });
});

describe("createSupabaseClient", () => {
  it("standard client disables session persistence", () => {
    createSupabaseClient({ url: URL, anonKey: "publishable" });

    // A server-side client that persisted a session would leak one request's
    // auth state into the next.
    expect(vi.mocked(createClient)).toHaveBeenCalledWith(URL, "publishable", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });
});
