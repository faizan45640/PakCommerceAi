import type { AppSupabaseClient } from "@pakcommerce/integrations/supabase";
import { Router, raw } from "express";

import { getWhatsAppProviderName } from "./config.js";
import { processInbound } from "./inbound-processing.js";
import { getMetaCloudConfig, MetaCloudProvider, safeEqual } from "./meta-cloud.js";
import type { WhatsAppProvider } from "./provider.js";

export { applyStatus, processInbound, statusesThatMayMoveTo } from "./inbound-processing.js";

/**
 * Meta WhatsApp Cloud API webhook (T-075 spike).
 *
 * Mounted BEFORE `express.json()`: the signature is over the exact raw bytes.
 * Spike-only: one number and one workspace from env (see `meta-cloud.ts`).
 */

export interface WebhookDeps {
  getProvider?: () => WhatsAppProvider | null;
  /** Override for tests; defaults to the service-role client. */
  getDb?: () => AppSupabaseClient;
}

/** Meta config, or null when another provider is selected or env is incomplete. */
function activeMetaConfig() {
  return getWhatsAppProviderName() === "meta" ? getMetaCloudConfig() : null;
}

export function createWhatsAppWebhookRouter(deps: WebhookDeps = {}): Router {
  const router = Router();

  const getProvider =
    deps.getProvider ??
    (() => {
      const config = activeMetaConfig();
      return config ? new MetaCloudProvider(config) : null;
    });

  router.get("/", (req, res) => {
    const config = activeMetaConfig();
    if (!config) return void res.status(404).end();

    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (
      req.query["hub.mode"] === "subscribe" &&
      typeof token === "string" &&
      typeof challenge === "string" &&
      safeEqual(token, config.verifyToken)
    ) {
      return void res.status(200).type("text/plain").send(challenge);
    }
    res.status(403).end();
  });

  router.post("/", raw({ type: "application/json", limit: "2mb" }), async (req, res) => {
    const config = activeMetaConfig();
    const provider = getProvider();
    if (!config || !provider) return void res.status(404).end();

    const rawBody = Buffer.isBuffer(req.body) ? req.body : null;
    if (!rawBody || !provider.verifyRequest(rawBody, req.headers)) {
      return void res.status(401).end();
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return void res.status(400).end();
    }

    // Process before answering: a 200 means "stored". A 500 makes Meta redeliver.
    try {
      const parsed = await provider.parseInbound(payload);
      await processInbound(parsed, config.workspaceId, deps.getDb?.());
      res.status(200).end();
    } catch {
      res.status(500).end();
    }
  });

  return router;
}
