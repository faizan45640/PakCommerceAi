import { randomUUID } from "node:crypto";

import type { MessageMedia } from "@pakcommerce/shared";
import { z } from "zod";

import { parseOrThrow } from "../lib/parse-or-throw.js";
import {
  ingestInboundMessage,
  ingestInboundMessageInputSchema,
  type IngestInboundMessageResult,
} from "./ingest.js";
import { assertWorkspaceOwned } from "./conversation-service.js";
import type { SellerContext } from "../middleware/seller-context.js";

/**
 * Mock WhatsApp inbound, for demos and tests before Twilio is connected.
 *
 * The body mirrors the form fields Twilio posts to an inbound webhook, plus
 * `workspaceId` and `aiEnabled`. Twilio sends everything as strings, so
 * `NumMedia` is accepted as a number or a numeric string.
 */

const MAX_MOCK_MEDIA = 10;

export const mockInboundBodySchema = z
  .object({
    workspaceId: z.uuid(),
    /** e.g. `whatsapp:+923001234567` */
    From: z.string().trim().min(1).max(64),
    ProfileName: z.string().trim().max(200).optional(),
    Body: z.string().max(4096).optional(),
    MessageSid: z.string().trim().min(1).max(100).optional(),
    NumMedia: z.coerce.number().int().min(0).max(MAX_MOCK_MEDIA).optional(),
    aiEnabled: z.boolean().default(false),
  })
  .catchall(z.unknown());

export type MockInboundBody = z.output<typeof mockInboundBodySchema>;

/** Reads `MediaUrl{n}` / `MediaContentType{n}` pairs, as Twilio numbers them. */
export function mediaFromTwilioFields(body: MockInboundBody): MessageMedia[] {
  const count = body.NumMedia ?? 0;
  const media: MessageMedia[] = [];

  for (let index = 0; index < count; index += 1) {
    media.push({
      url: String(body[`MediaUrl${index}`] ?? ""),
      contentType: String(body[`MediaContentType${index}`] ?? ""),
    });
  }

  return media;
}

/**
 * On by default in development and test; production must opt in with
 * `ENABLE_MOCK_INBOUND=true`. An explicit value always wins.
 */
export function isMockInboundEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.ENABLE_MOCK_INBOUND?.trim().toLowerCase();
  if (flag === "true" || flag === "1") return true;
  if (flag === "false" || flag === "0") return false;
  return env.NODE_ENV === "development" || env.NODE_ENV === "test";
}

export async function ingestMockInbound(
  auth: SellerContext,
  body: MockInboundBody,
): Promise<IngestInboundMessageResult> {
  // Shape errors (bad media URL, empty message) are the caller's fault: 400.
  const input = parseOrThrow(
    ingestInboundMessageInputSchema,
    {
      workspaceId: body.workspaceId,
      from: body.From,
      profileName: body.ProfileName,
      messageSid: body.MessageSid ?? `SMmock${randomUUID().replace(/-/g, "")}`,
      body: body.Body,
      media: mediaFromTwilioFields(body),
      aiEnabled: body.aiEnabled,
    },
    "mock inbound message",
  );

  // The ingest runs as the service role, so ownership is proven first with the
  // seller's own token (RLS). Nothing reaches the RPC for another seller's workspace.
  await assertWorkspaceOwned(auth, input.workspaceId);

  return ingestInboundMessage(input);
}
