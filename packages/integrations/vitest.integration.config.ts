import { defineConfig } from "vitest/config";

/**
 * Tier 2 (integration) — `npm run test:integration`.
 *
 * Binds exactly one real dependency: the Postgres inside the local Supabase
 * stack. Start it with `npx supabase start` first.
 *
 * Single-threaded on purpose. Every test wraps itself in a transaction it rolls
 * back, and parallel workers on one connection pool would interleave those
 * transactions unpredictably.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.itest.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
