import type { AppSupabaseClient } from "@pakcommerce/integrations/supabase";
import { Router, raw } from "express";

import { getWhatsAppProviderName } from "./config.js";
import { processInbound } from "./inbound-processing.js";
import type { WhatsAppProvider } from "./provider.js";
import { getTwilioConfig, parseFormBody, TwilioProvider } from "./twilio.js";

/**
 * Twilio WhatsApp webhook (inbound messages and status callbacks, one URL).
 *
 * Mounted BEFORE `express.json()`. It reads its own raw form body, and the
 * signature is checked against `TWILIO_WEBHOOK_PUBLIC_URL`, never the proxy URL.
 */

const EMPTY_TWIML = "<Response/>";

export interface TwilioWebhookDeps {
  getProvider?: () => WhatsAppProvider | null;
  /** Override for tests; defaults to the service-role client. */
  getDb?: () => AppSupabaseClient;
}

export function createTwilioWebhookRouter(deps: TwilioWebhookDeps = {}): Router {
  const router = Router();

  router.post("/", raw({ type: "application/x-www-form-urlencoded", limit: "1mb" }), async (req, res) => {
    const config = getWhatsAppProviderName() === "twilio" ? getTwilioConfig() : null;
    if (!config) return void res.status(404).end();
    const provider = deps.getProvider?.() ?? new TwilioProvider(config);

    const rawBody = Buffer.isBuffer(req.body) ? req.body : null;
    if (!rawBody || !provider.verifyRequest(rawBody, req.headers)) {
      return void res.status(401).end();
    }

    // Process before answering: a 200 means "stored". A 500 makes Twilio retry.
    try {
      const parsed = await provider.parseInbound(parseFormBody(rawBody));
      await processInbound(parsed, config.workspaceId, deps.getDb?.());
      res.status(200).type("text/xml").send(EMPTY_TWIML);
    } catch {
      res.status(500).end();
    }
  });

  return router;
}
