import type { MessageMedia } from "@pakcommerce/shared";

/**
 * WhatsApp provider adapter. The webhook and reply code only know this
 * interface, so Meta Cloud API (T-075) and Twilio (planned) are swappable.
 */

export interface InboundMessage {
  /** Provider message id (Meta `wamid`). Deduplicates retries. */
  providerMessageId: string;
  /** Sender address as a phone number, e.g. `+923001234567`. */
  from: string;
  profileName: string | null;
  body: string | null;
  media: MessageMedia[];
}

export type DeliveryStatus = "sent" | "delivered" | "read" | "failed";

export interface StatusUpdate {
  providerMessageId: string;
  status: DeliveryStatus;
}

export interface ParsedInbound {
  messages: InboundMessage[];
  statuses: StatusUpdate[];
}

export interface WhatsAppProvider {
  /** True when the raw body was signed by the provider. */
  verifyRequest(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;
  /** Turns a verified webhook payload into normalized messages and statuses. */
  parseInbound(payload: unknown): Promise<ParsedInbound>;
  /** Sends a text message; resolves to the provider message id. */
  sendText(to: string, body: string): Promise<string>;
}

export class WhatsAppProviderError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "WhatsAppProviderError";
    this.status = status;
  }
}
