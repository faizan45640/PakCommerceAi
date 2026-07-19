import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { healthRouter } from "./routes/health.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const app = express();
const port = Number(process.env.API_PORT) || 4000;
const appUrl = process.env.APP_URL ?? "http://localhost:3000";

app.use(cors({ origin: appUrl }));
app.use(express.json());

app.use("/health", healthRouter);
app.use("/api/v1", healthRouter);

app.listen(port, () => {
  console.log(`API running at http://localhost:${port}`);
});
