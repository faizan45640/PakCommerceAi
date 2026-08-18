import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createApp } from "./app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// src/index.ts and dist/index.js sit at the same depth, so this reaches the
// monorepo root either way. Next.js does not read this file — apps/web uses
// apps/web/.env.local. See docs/RUNBOOK.md §4.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const port = Number(process.env.API_PORT) || 4000;

createApp().listen(port, () => {
  console.log(`API running at http://localhost:${port}`);
});
