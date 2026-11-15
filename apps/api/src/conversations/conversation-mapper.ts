import type { Database } from "@pakcommerce/integrations/supabase";
import {
  conversationSchema,
  messageSchema,
  type Conversation,
  type Message,
} from "@pakcommerce/shared/conversations";

/**
 * Translates conversation and message rows into the shared contract.
 *
 * Pure functions. The result is validated, so a malformed row fails here
 * rather than in the dashboard. Postgres enums arrive as the same strings the
 * contract uses, so the schemas do the narrowing.
 */

export type ConversationRow = Database["public"]["Tables"]["conversations"]["Row"];
export type MessageRow = Database["public"]["Tables"]["messages"]["Row"];

export function toConversation(row: ConversationRow): Conversation {
  return conversationSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    channel: row.channel,
    buyerPhone: row.buyer_phone,
    buyerName: row.buyer_name,
    customerId: row.customer_id,
    state: row.state,
    handoffReason: row.handoff_reason,
    unreadCount: row.unread_count,
    lastMessageAt: row.last_message_at,
    lastMessagePreview: row.last_message_preview,
    lastMessageSender: row.last_message_sender,
    stateChangedAt: row.state_changed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function toMessage(row: MessageRow): Message {
  return messageSchema.parse({
    id: row.id,
    conversationId: row.conversation_id,
    direction: row.direction,
    sender: row.sender,
    body: row.body,
    media: Array.isArray(row.media) ? row.media : [],
    status: row.status,
    createdAt: row.created_at,
  });
}
