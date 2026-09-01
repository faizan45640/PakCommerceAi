import { defineConfig } from "vitest/config";

/**
 * Tier 1 (unit) only — the default `npm run test`.
 *
 * No database, no network, no containers, so a teammate without Docker running
 * can still run this suite. The *.itest.ts files go through
 * vitest.integration.config.ts instead.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
