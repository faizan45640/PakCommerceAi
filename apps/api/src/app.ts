import cors from "cors";
import express from "express";

import { requireAuth } from "./middleware/auth.js";
import { supabaseTokenVerifier } from "./middleware/verify-supabase-token.js";
import { errorHandler } from "./middleware/error-handler.js";
import { productRouter } from "./products/product-router.js";
import { copilotRouter } from "./copilot/copilot-router.js";
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
  app.use("/api/v1", healthRouter);

  // Everything mounted below requires a valid Supabase access token.
  // Keep public routes above this line; add protected routers below it.
  // Copilot is protected too: its tools will mutate inventory and read seller
  // data, so the endpoint must not be callable by anyone off the street.
  app.use("/api/v1/copilot", requireAuth(supabaseTokenVerifier), copilotRouter);
  app.use("/copilot", requireAuth(supabaseTokenVerifier), copilotRouter);
  app.use("/api/v1/products", requireAuth(supabaseTokenVerifier), productRouter);

  app.use(
    "/api/v1",
    requireAuth(supabaseTokenVerifier),
    (_req, res) => {
      res.status(404).json({
        error: { code: "not_found", message: "Unknown API endpoint." },
      });
    },
  );

  // Last, and after every route: Express picks error handlers by arity and only
  // consults the ones registered after the route that threw.
  app.use(errorHandler);

  return app;
}
