import { randomUUID } from "node:crypto";

import type { ParsedInbound, WhatsAppProvider } from "./provider.js";

/**
 * Simulator provider (`WHATSAPP_PROVIDER=simulator`): no network, no webhook.
 *
 * Buyers are simulated through the mock inbound endpoint; the agent's and the
 * seller's replies "send" instantly and are stored as `sent`. It records what
 * it was asked to send so tests can assert on it.
 */

const KEEP_SENT = 100;

export interface SimulatedSend {
  to: string;
  body: string;
  providerMessageId: string;
}

export class SimulatorProvider implements WhatsAppProvider {
  readonly sent: SimulatedSend[] = [];

  /** There is no webhook, so nothing is ever verified. */
  verifyRequest(): boolean {
    return false;
  }

  async parseInbound(): Promise<ParsedInbound> {
    return { messages: [], statuses: [] };
  }

  async sendText(to: string, body: string): Promise<string> {
    const providerMessageId = `sim-${randomUUID()}`;
    this.sent.push({ to, body, providerMessageId });
    if (this.sent.length > KEEP_SENT) this.sent.shift();
    return providerMessageId;
  }
}
