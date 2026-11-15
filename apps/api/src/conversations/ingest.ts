import type { AppSupabaseClient } from "@pakcommerce/integrations/supabase";
import {
  MAX_MESSAGE_BODY_LENGTH,
  MAX_MESSAGE_MEDIA,
  conversationStateSchema,
  messageMediaSchema,
  normalizePhone,
  type ConversationState,
} from "@pakcommerce/shared";
import { z } from "zod";

import { createApiSupabaseAdminClient } from "../lib/supabase.js";

/**
 * The one path an inbound buyer message takes into the inbox.
 *
 * Provider-neutral on purpose: the mock endpoint (T-069) and the real Twilio
 * webhook (T-079) both call this, so they cannot drift. It runs with the admin
 * client because `ingest_inbound_message` is granted to the service role only,
 * so callers MUST have established who owns `workspaceId` first (the mock
 * endpoint checks with the seller's own token; the webhook resolves the
 * workspace from the Twilio number).
 */

/** Strips a channel prefix such as Twilio's `whatsapp:`. */
export function stripChannelPrefix(address: string): string {
  return address.trim().replace(/^whatsapp:/i, "");
}

export const ingestInboundMessageInputSchema = z
  .object({
    workspaceId: z.uuid(),
    /** Buyer address. A `whatsapp:` prefix is accepted and stripped. */
    from: z.string().trim().min(1).max(64),
    profileName: z.string().trim().max(200).nullish(),
    /** Provider message id (Twilio MessageSid). Deduplicates retries. */
    messageSid: z.string().trim().min(1).max(100),
    body: z.string().max(MAX_MESSAGE_BODY_LENGTH).nullish(),
    media: z.array(messageMediaSchema).max(MAX_MESSAGE_MEDIA).default([]),
    aiEnabled: z.boolean().default(false),
  })
  .refine((input) => (input.body ?? "").trim() !== "" || input.media.length > 0, {
    message: "A message needs text or at least one attachment.",
    path: ["body"],
  })
  .refine((input) => normalizePhone(stripChannelPrefix(input.from)) !== "", {
    message: "Sender must be a phone number.",
    path: ["from"],
  });

export type IngestInboundMessageInput = z.input<typeof ingestInboundMessageInputSchema>;

export interface IngestInboundMessageResult {
  conversationId: string;
  messageId: string;
  duplicate: boolean;
  state: ConversationState;
}

export async function ingestInboundMessage(
  rawInput: IngestInboundMessageInput,
  db: AppSupabaseClient = createApiSupabaseAdminClient(),
): Promise<IngestInboundMessageResult> {
  const input = ingestInboundMessageInputSchema.parse(rawInput);

  const { data, error } = await db.rpc("ingest_inbound_message", {
    p_workspace_id: input.workspaceId,
    // The database normalises the phone.
    p_buyer_phone: stripChannelPrefix(input.from),
    p_buyer_name: input.profileName ?? "",
    p_provider_message_id: input.messageSid,
    p_body: input.body ?? "",
    p_media: input.media,
    p_ai_enabled: input.aiEnabled,
  });

  if (error) throw new Error(error.message, { cause: error });

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("ingest_inbound_message returned no row.");

  return {
    conversationId: row.conversation_id,
    messageId: row.message_id,
    duplicate: row.duplicate,
    state: conversationStateSchema.parse(row.state),
  };
}
