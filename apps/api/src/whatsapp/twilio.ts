import { createHmac } from "node:crypto";

import { MAX_MESSAGE_MEDIA, type MessageMedia } from "@pakcommerce/shared";

import { safeEqual } from "./meta-cloud.js";
import {
  WhatsAppProviderError,
  type DeliveryStatus,
  type InboundMessage,
  type ParsedInbound,
  type ProviderFailureReason,
  type WhatsAppProvider,
} from "./provider.js";

/**
 * Twilio WhatsApp adapter.
 *
 * SPIKE-ONLY CONFIG, like the Meta adapter: one number, one workspace, from env.
 * Signature validation is implemented here (HMAC-SHA1 per Twilio's docs, about
 * ten lines) rather than adding the `twilio` package for a single function.
 */

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** e.g. `whatsapp:+14155238886` (the sandbox number). */
  from: string;
  /** The exact public URL Twilio calls. The signature covers it, so never derive it from the proxy. */
  webhookPublicUrl: string;
  workspaceId: string;
}

const REQUIRED_ENV = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_WHATSAPP_FROM",
  "TWILIO_WEBHOOK_PUBLIC_URL",
  "WHATSAPP_WORKSPACE_ID",
] as const;

/** Null (feature off) unless every required variable is set. */
export function getTwilioConfig(env: NodeJS.ProcessEnv = process.env): TwilioConfig | null {
  if (REQUIRED_ENV.some((key) => !env[key]?.trim())) return null;
  return {
    accountSid: env.TWILIO_ACCOUNT_SID!.trim(),
    authToken: env.TWILIO_AUTH_TOKEN!.trim(),
    from: env.TWILIO_WHATSAPP_FROM!.trim(),
    webhookPublicUrl: env.TWILIO_WEBHOOK_PUBLIC_URL!.trim(),
    workspaceId: env.WHATSAPP_WORKSPACE_ID!.trim(),
  };
}

/** Form fields as parsed from the body; repeated keys become arrays. */
export type TwilioParams = Record<string, string | string[]>;

export function parseFormBody(rawBody: Buffer): TwilioParams {
  const params: TwilioParams = {};
  for (const [key, value] of new URLSearchParams(rawBody.toString("utf8"))) {
    const existing = params[key];
    if (existing === undefined) params[key] = value;
    else params[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  return params;
}

/** Twilio's algorithm: URL + each key (sorted) followed by its value(s) (sorted), HMAC-SHA1, base64. */
export function computeTwilioSignature(authToken: string, url: string, params: TwilioParams): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => {
      const value = params[key]!;
      return acc + key + (Array.isArray(value) ? [...value].sort().join(key) : value);
    }, url);
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

const STATUS_MAP: Record<string, DeliveryStatus> = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
  undelivered: "failed",
};

/** Twilio error codes the seller can act on. Never inspects message content. */
export function classifyTwilioFailure(status: number, code?: number): ProviderFailureReason {
  if (code === 63016) return "reengagement";
  if (status === 401 || code === 20003) return "token";
  if (code === 21608) return "recipient";
  return "other";
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export class TwilioProvider implements WhatsAppProvider {
  constructor(
    private readonly config: TwilioConfig,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  verifyRequest(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean {
    const signature = first(headers["x-twilio-signature"]);
    if (!signature) return false;
    const expected = computeTwilioSignature(this.config.authToken, this.config.webhookPublicUrl, parseFormBody(rawBody));
    return safeEqual(signature, expected);
  }

  /** `payload` is the parsed form (see `parseFormBody`). */
  async parseInbound(payload: unknown): Promise<ParsedInbound> {
    const result: ParsedInbound = { messages: [], statuses: [] };
    if (!payload || typeof payload !== "object") return result;
    const p = payload as TwilioParams;

    const sid = first(p.MessageSid) ?? first(p.SmsSid);
    if (!sid) return result;

    // Status callbacks carry MessageStatus and no Body; inbound messages carry Body/NumMedia.
    const status = first(p.MessageStatus);
    if (status && p.Body === undefined && p.NumMedia === undefined) {
      const mapped = STATUS_MAP[status.toLowerCase()];
      // queued/accepted/sending/scheduled have no counterpart worth recording.
      if (mapped) result.statuses.push({ providerMessageId: sid, status: mapped });
      return result;
    }

    const from = first(p.From);
    // Only WhatsApp is wired up; ignore SMS or other channels sent to the same URL.
    if (!from || !/^whatsapp:/i.test(from)) return result;

    const media: MessageMedia[] = [];
    const count = Math.min(Number.parseInt(first(p.NumMedia) ?? "0", 10) || 0, MAX_MESSAGE_MEDIA, 10);
    for (let i = 0; i < count; i += 1) {
      const url = first(p[`MediaUrl${i}`]);
      if (!url || !/^https:\/\//i.test(url)) continue;
      // Known gap (as with Meta): Twilio media URLs need basic auth. Store URL + type only, no credentials.
      media.push({ url, contentType: first(p[`MediaContentType${i}`]) || "application/octet-stream" });
    }

    const text = first(p.Body);
    const message: InboundMessage = {
      providerMessageId: sid,
      from: from.replace(/^whatsapp:/i, ""),
      profileName: first(p.ProfileName)?.trim() || null,
      body: text?.trim() ? text : null,
      media,
    };
    result.messages.push(message);
    return result;
  }

  async sendText(to: string, body: string): Promise<string> {
    const form = new URLSearchParams({
      From: this.config.from,
      To: `whatsapp:${to.startsWith("+") ? to : `+${to}`}`,
      Body: body,
      StatusCallback: this.config.webhookPublicUrl,
    });
    const auth = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString("base64");

    let response: Response;
    try {
      response = await this.fetchImpl(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.config.accountSid)}/Messages.json`,
        {
          method: "POST",
          headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: form,
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch {
      throw new WhatsAppProviderError("Could not reach WhatsApp.");
    }

    const data = (await response.json().catch(() => null)) as { sid?: unknown; code?: unknown } | null;
    if (!response.ok) {
      const code = typeof data?.code === "number" ? data.code : undefined;
      throw new WhatsAppProviderError(
        "WhatsApp rejected the message.",
        response.status,
        code,
        classifyTwilioFailure(response.status, code),
      );
    }
    if (typeof data?.sid !== "string" || !data.sid) {
      throw new WhatsAppProviderError("WhatsApp returned an unexpected response.");
    }
    return data.sid;
  }
}
