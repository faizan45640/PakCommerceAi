import { defineConfig } from "vitest/config";

/**
 * Tier 1 (unit) only — the default `npm run test`.
 *
 * Unit tests must need nothing: no database, no network, no containers. The
 * *.itest.ts files are excluded here and run through vitest.integration.config.ts
 * instead, so a teammate without Docker running can still run this suite.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
