// Shared ESLint base for the Node workspaces (apps/api, packages/*).
//
// apps/web does NOT use this — it has its own config built on eslint-config-next,
// which brings React and Next.js specific rules this base has no business knowing about.
//
// Each workspace re-exports this from its own eslint.config.mjs so that
// `npm run lint -w <workspace>` works from anywhere without config discovery games.

import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      // A leading underscore means "required by a signature I do not control,
      // deliberately unused". Express identifies an error handler by its arity,
      // so dropping the unused `next` parameter silently turns it into ordinary
      // middleware that never runs - the parameter has to stay.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // TypeScript resolves identifiers itself. ESLint's no-undef cannot see Node or
      // DOM globals in a flat config without a globals package, so it only produces
      // false positives here.
      "no-undef": "off",
    },
  },
);
