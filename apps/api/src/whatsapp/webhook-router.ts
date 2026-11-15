import type { AppSupabaseClient } from "@pakcommerce/integrations/supabase";
import { Router, raw } from "express";
import { ZodError } from "zod";

import { ingestInboundMessage } from "../conversations/ingest.js";
import { createApiSupabaseAdminClient } from "../lib/supabase.js";
import { getMetaCloudConfig, MetaCloudProvider, safeEqual } from "./meta-cloud.js";
import type { DeliveryStatus, ParsedInbound, StatusUpdate, WhatsAppProvider } from "./provider.js";

/**
 * Meta WhatsApp Cloud API webhook (T-075 spike).
 *
 * Mounted BEFORE `express.json()`: the signature is over the exact raw bytes.
 * Spike-only: one number and one workspace from env (see `meta-cloud.ts`).
 */

const RANK = { queued: 0, sent: 1, delivered: 2, read: 3 } as const;

/** Current statuses a new `target` may overwrite: read/delivered are never downgraded. */
export function statusesThatMayMoveTo(target: DeliveryStatus): Array<keyof typeof RANK> {
  if (target === "failed") return ["queued", "sent"];
  return (Object.keys(RANK) as Array<keyof typeof RANK>).filter((s) => RANK[s] < RANK[target]);
}

/** Throws on a database error so the webhook answers 500 and Meta redelivers (updates are idempotent). */
export async function applyStatus(db: AppSupabaseClient, update: StatusUpdate): Promise<void> {
  // Unknown ids match no row, which is the intended "ignore".
  const { error } = await db
    .from("messages")
    .update({ status: update.status })
    .eq("provider_message_id", update.providerMessageId)
    .eq("direction", "outbound")
    .in("status", statusesThatMayMoveTo(update.status));
  if (error) throw new Error(error.message, { cause: error });
}

/**
 * Invalid input (schema violations, data/integrity SQL classes 22 and 23) will
 * never succeed on redelivery; anything else (network, database down) might.
 */
function isPermanent(error: unknown): boolean {
  if (error instanceof ZodError) return true;
  const code = (error as { cause?: { code?: unknown } })?.cause?.code;
  return typeof code === "string" && (code.startsWith("22") || code.startsWith("23"));
}

/**
 * Ingests every message and applies every status. Permanent failures are
 * logged (safe reason only) and skipped; if any failure is transient this
 * throws after processing the rest, so the webhook answers 500 and Meta
 * redelivers. Redelivery is safe: ingest dedupes by wamid.
 */
export async function processInbound(
  parsed: ParsedInbound,
  workspaceId: string,
  db: AppSupabaseClient = createApiSupabaseAdminClient(),
): Promise<void> {
  let transient: unknown = null;

  const run = async (label: string, work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (error) {
      if (isPermanent(error)) {
        console.error(`whatsapp ${label} skipped: invalid`, error instanceof Error ? error.name : "error");
      } else {
        console.error(`whatsapp ${label} failed: will retry`, error instanceof Error ? error.name : "error");
        transient = error;
      }
    }
  };

  for (const message of parsed.messages) {
    await run("inbound ingest", () =>
      ingestInboundMessage(
        {
          workspaceId,
          from: message.from,
          profileName: message.profileName,
          messageSid: message.providerMessageId,
          body: message.body,
          media: message.media,
          aiEnabled: false,
        },
        db,
      ),
    );
  }
  for (const status of parsed.statuses) {
    await run("status update", () => applyStatus(db, status));
  }

  if (transient) throw transient;
}

export interface WebhookDeps {
  getProvider?: () => WhatsAppProvider | null;
  /** Override for tests; defaults to the service-role client. */
  getDb?: () => AppSupabaseClient;
}

export function createWhatsAppWebhookRouter(deps: WebhookDeps = {}): Router {
  const router = Router();

  const getProvider =
    deps.getProvider ??
    (() => {
      const config = getMetaCloudConfig();
      return config ? new MetaCloudProvider(config) : null;
    });

  router.get("/", (req, res) => {
    const config = getMetaCloudConfig();
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
    const config = getMetaCloudConfig();
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
