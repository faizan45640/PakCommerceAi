import cors from "cors";
import express from "express";

import { copilotRouter } from "./routes/copilot.js";
import { healthRouter } from "./routes/health.js";

export interface CreateAppOptions {
  /** CORS origin. Defaults to APP_URL, then http://localhost:3000. */
  appUrl?: string;
}

/**
 * Builds the Express app without binding a port.
 *
 * Kept separate from `index.ts` so tests can drive the app in-process — importing
 * a module that calls `listen()` at import time would leave a socket open.
 */
export function createApp(options: CreateAppOptions = {}): express.Express {
  const appUrl = options.appUrl ?? process.env.APP_URL ?? "http://localhost:3000";

  const app = express();

  app.use(cors({ origin: appUrl }));
  app.use(express.json());

  app.use("/health", healthRouter);
  app.use("/api/v1/copilot", copilotRouter);
  app.use("/copilot", copilotRouter);
  app.use("/api/v1", healthRouter);

  return app;
}
