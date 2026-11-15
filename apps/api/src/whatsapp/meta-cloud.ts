import { createHmac, timingSafeEqual } from "node:crypto";

import type { MessageMedia } from "@pakcommerce/shared";
import { z } from "zod";

import {
  WhatsAppProviderError,
  type DeliveryStatus,
  type InboundMessage,
  type ParsedInbound,
  type WhatsAppProvider,
} from "./provider.js";

/**
 * Meta WhatsApp Cloud API adapter.
 *
 * SPIKE-ONLY CONFIG: a single connected number and a single workspace come from
 * env. Per-seller channel configuration replaces this later.
 */

export interface MetaCloudConfig {
  accessToken: string;
  phoneNumberId: string;
  appSecret: string;
  verifyToken: string;
  /** Spike-only: the one workspace the connected number belongs to. */
  workspaceId: string;
  graphVersion: string;
}

const REQUIRED_ENV = [
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_WORKSPACE_ID",
] as const;

/** Null (feature off) unless every required variable is set. */
export function getMetaCloudConfig(env: NodeJS.ProcessEnv = process.env): MetaCloudConfig | null {
  if (REQUIRED_ENV.some((key) => !env[key]?.trim())) return null;
  return {
    accessToken: env.WHATSAPP_ACCESS_TOKEN!.trim(),
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID!.trim(),
    appSecret: env.WHATSAPP_APP_SECRET!.trim(),
    verifyToken: env.WHATSAPP_VERIFY_TOKEN!.trim(),
    workspaceId: env.WHATSAPP_WORKSPACE_ID!.trim(),
    graphVersion: env.WHATSAPP_GRAPH_VERSION?.trim() || "v23.0",
  };
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Only the parts of the webhook payload we use; everything else is ignored.
const mediaRefSchema = z.object({ id: z.string().min(1), caption: z.string().optional() });

const inboundMessageSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  audio: mediaRefSchema.optional(),
  image: mediaRefSchema.optional(),
  document: mediaRefSchema.optional(),
  video: mediaRefSchema.optional(),
});

const statusSchema = z.object({ id: z.string().min(1), status: z.string() });

const valueSchema = z.object({
  metadata: z.object({ phone_number_id: z.string() }),
  contacts: z
    .array(
      z.object({
        wa_id: z.string().optional(),
        profile: z.object({ name: z.string().optional() }).optional(),
      }),
    )
    .optional(),
  messages: z.array(z.unknown()).optional(),
  statuses: z.array(z.unknown()).optional(),
});

const payloadSchema = z.object({
  entry: z
    .array(z.object({ changes: z.array(z.object({ field: z.string(), value: z.unknown() })).default([]) }))
    .default([]),
});

const STATUS_VALUES: readonly string[] = ["sent", "delivered", "read", "failed"];
const MEDIA_TYPES = ["audio", "image", "document", "video"] as const;

export class MetaCloudProvider implements WhatsAppProvider {
  constructor(
    private readonly config: MetaCloudConfig,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  private url(path: string): string {
    return `https://graph.facebook.com/${this.config.graphVersion}/${path}`;
  }

  verifyRequest(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean {
    const header = headers["x-hub-signature-256"];
    const signature = Array.isArray(header) ? header[0] : header;
    if (!signature) return false;
    const expected = `sha256=${createHmac("sha256", this.config.appSecret).update(rawBody).digest("hex")}`;
    return safeEqual(signature, expected);
  }

  async parseInbound(payload: unknown): Promise<ParsedInbound> {
    const result: ParsedInbound = { messages: [], statuses: [] };
    const parsed = payloadSchema.safeParse(payload);
    if (!parsed.success) return result;

    for (const entry of parsed.data.entry) {
      for (const change of entry.changes) {
        if (change.field !== "messages") continue;
        const value = valueSchema.safeParse(change.value);
        // Spike-only: ignore anything not addressed to the one connected number.
        if (!value.success || value.data.metadata.phone_number_id !== this.config.phoneNumberId) continue;

        const names = new Map<string, string>();
        for (const contact of value.data.contacts ?? []) {
          if (contact.wa_id && contact.profile?.name) names.set(contact.wa_id, contact.profile.name);
        }

        for (const raw of value.data.messages ?? []) {
          const message = inboundMessageSchema.safeParse(raw);
          if (!message.success) continue;
          const normalized = await this.normalizeMessage(message.data, names.get(message.data.from) ?? null);
          if (normalized) result.messages.push(normalized);
        }

        for (const raw of value.data.statuses ?? []) {
          const status = statusSchema.safeParse(raw);
          if (!status.success || !STATUS_VALUES.includes(status.data.status)) continue;
          result.statuses.push({
            providerMessageId: status.data.id,
            status: status.data.status as DeliveryStatus,
          });
        }
      }
    }
    return result;
  }

  private async normalizeMessage(
    message: z.infer<typeof inboundMessageSchema>,
    profileName: string | null,
  ): Promise<InboundMessage | null> {
    const base = { providerMessageId: message.id, from: `+${message.from}`, profileName };

    if (message.type === "text") {
      return { ...base, body: message.text?.body ?? null, media: [] };
    }

    const type = MEDIA_TYPES.find((candidate) => candidate === message.type);
    const ref = type ? message[type] : undefined;
    if (!ref) return null; // location, reaction, sticker, ...: not supported in the spike

    const media: MessageMedia[] = [];
    try {
      media.push(await this.resolveMedia(ref.id));
    } catch {
      // Media lookup failed: keep the caption (if any) rather than dropping the message.
    }
    const body = ref.caption?.trim() || null;
    if (!body && media.length === 0) return null;
    return { ...base, body, media };
  }

  /** `GET /{media-id}` returns a short-lived https URL and the mime type. */
  private async resolveMedia(mediaId: string): Promise<MessageMedia> {
    const response = await this.fetchImpl(this.url(encodeURIComponent(mediaId)), {
      headers: { Authorization: `Bearer ${this.config.accessToken}` },
    });
    if (!response.ok) throw new WhatsAppProviderError("Media lookup failed.", response.status);
    const data = z
      .object({ url: z.url({ protocol: /^https$/ }), mime_type: z.string().min(1) })
      .parse(await response.json());
    return { url: data.url, contentType: data.mime_type };
  }

  async sendText(to: string, body: string): Promise<string> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.url(`${this.config.phoneNumberId}/messages`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: to.replace(/^\+/, ""),
          type: "text",
          text: { body },
        }),
      });
    } catch {
      throw new WhatsAppProviderError("Could not reach WhatsApp.");
    }
    if (!response.ok) throw new WhatsAppProviderError("WhatsApp rejected the message.", response.status);

    const data = z
      .object({ messages: z.array(z.object({ id: z.string().min(1) })).min(1) })
      .safeParse(await response.json().catch(() => null));
    if (!data.success) throw new WhatsAppProviderError("WhatsApp returned an unexpected response.");
    return data.data.messages[0]!.id;
  }
}
