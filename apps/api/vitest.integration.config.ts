import { defineConfig } from "vitest/config";

/**
 * Tier 2 (integration) — `npm run test:integration`.
 *
 * Drives the real Express app against the real local Supabase stack with real
 * JWTs. Start it with `npx supabase start` first.
 *
 * Single-threaded: each test creates a seller through the auth admin API and
 * deletes them afterwards, and parallel workers would race on the shared auth
 * schema. Timeouts are generous because signup and sign-in are real HTTP round
 * trips, not stubs.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.itest.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
