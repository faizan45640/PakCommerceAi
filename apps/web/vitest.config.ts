import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Node, not jsdom: these are pure-function tests. The dashboard components
    // render hardcoded mock data, so rendering them would assert that a
    // constant equals itself. See docs/impl-specs/github-ci/SPEC.md §2.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
