import { build } from "esbuild";

// The workspace packages export TypeScript source (`./src/index.ts`), which Node
// cannot execute from `dist/`. Bundling them into the API output keeps that dev
// convenience intact while producing a self-contained ESM bundle for production.
await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  logLevel: "info",
  plugins: [
    {
      name: "externalize-npm-dependencies",
      setup(builder) {
        builder.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith("@pakcommerce/")) {
            return undefined;
          }

          return { path: args.path, external: true };
        });
      },
    },
  ],
});
