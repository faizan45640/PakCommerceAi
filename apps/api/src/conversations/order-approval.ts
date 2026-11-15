import type { AppSupabaseClient } from "@pakcommerce/integrations/supabase";
import type { OrderDetail } from "@pakcommerce/shared";
import {
  assertConversationTransition,
  type Conversation,
  type Message,
} from "@pakcommerce/shared/conversations";

import { ConflictError } from "../lib/http-errors.js";
import { createApiSupabaseAdminClient } from "../lib/supabase.js";
import type { SellerContext } from "../middleware/seller-context.js";
import { transitionOrderStatus } from "../orders/order-service.js";
import { orderRef } from "../tools/sales-agent-order-tools.js";
import type { WhatsAppProvider } from "../whatsapp/provider.js";
import { toConversation, toMessage, type ConversationRow, type MessageRow } from "./conversation-mapper.js";
import { getConversation } from "./conversation-service.js";

/**
 * The seller's decision on an AI order that is waiting for approval (S11).
 *
 * The conversation must be `waiting_approval` and the order must be that
 * conversation's open AI draft; anything else is a 409. Approve confirms the
 * order (stock is deducted by transition_order_status) and hands the
 * conversation back to the AI, then tells the buyer. Reject cancels the draft
 * and leaves the conversation with the seller (`human_takeover`).
 *
 * Order first, conversation second: a stock failure leaves everything as it
 * was. The conversation update is conditional on `waiting_approval`, so a
 * concurrent change is never overwritten.
 */

export interface OrderApprovalInput {
  workspaceId: string;
  orderId: string;
  decision: "approve" | "reject";
}

export interface OrderApprovalResult {
  conversation: Conversation;
  order: OrderDetail;
  /** The confirmation sent to the buyer (approve only). `failed` when WhatsApp could not deliver it. */
  message: Message | null;
}

export const APPROVAL_MESSAGE = (ref: string) => `Aapka order ${ref} confirm ho gaya. Shukriya!`;

export async function decideOrderApproval(
  auth: SellerContext,
  conversationId: string,
  input: OrderApprovalInput,
  provider: WhatsAppProvider | null,
  admin: AppSupabaseClient = createApiSupabaseAdminClient(),
): Promise<OrderApprovalResult> {
  const conversation = await getConversation(auth, input.workspaceId, conversationId);
  if (conversation.state !== "waiting_approval") {
    throw new ConflictError(`This conversation is ${conversation.state}, not waiting for approval.`);
  }

  const { data: order, error } = await auth.db
    .from("orders")
    .select("id, status")
    .eq("id", input.orderId)
    .eq("workspace_id", input.workspaceId)
    .eq("conversation_id", conversationId)
    .eq("created_via", "whatsapp_ai")
    .maybeSingle();
  if (error) throw new Error(error.message, { cause: error });
  if (!order || order.status !== "draft") {
    throw new ConflictError("That order is not the pending AI draft of this conversation.");
  }

  const ref = orderRef(order.id);
  const approve = input.decision === "approve";
  const next = approve ? "ai_active" : "human_takeover";
  assertConversationTransition("waiting_approval", next, "seller");

  const detail = await transitionOrderStatus(
    auth,
    input.workspaceId,
    order.id,
    approve ? "confirmed" : "cancelled",
    approve ? "Approved by the seller" : "Rejected by the seller",
  );

  const { data: row, error: updateError } = await auth.db
    .from("conversations")
    .update({
      state: next,
      handoff_reason: approve ? null : `You rejected order ${ref} — let the buyer know`,
    })
    .eq("id", conversationId)
    .eq("workspace_id", input.workspaceId)
    .eq("state", "waiting_approval")
    .select("*")
    .maybeSingle();
  if (updateError) throw new Error(updateError.message, { cause: updateError });

  // Someone moved the conversation after we read it. The order decision stands.
  const updated = row ? toConversation(row as ConversationRow) : await getConversation(auth, input.workspaceId, conversationId);

  const message = approve
    ? await notifyBuyer(admin, provider, conversation, auth.sellerId, APPROVAL_MESSAGE(ref))
    : null;

  return { conversation: updated, order: detail, message };
}

/** Sends a short system message to the buyer and records it. A failed send is recorded, not thrown. */
async function notifyBuyer(
  admin: AppSupabaseClient,
  provider: WhatsAppProvider | null,
  conversation: Conversation,
  sellerId: string,
  body: string,
): Promise<Message | null> {
  let providerMessageId: string | null = null;
  if (provider) {
    try {
      providerMessageId = await provider.sendText(conversation.buyerPhone, body);
    } catch (error) {
      console.error("order approval message failed", conversation.id, error instanceof Error ? error.name : "error");
    }
  } else {
    console.error("order approval message failed", conversation.id, "no_provider");
  }

  const { data, error } = await admin
    .from("messages")
    .insert({
      workspace_id: conversation.workspaceId,
      seller_id: sellerId,
      conversation_id: conversation.id,
      direction: "outbound",
      sender: "system",
      body,
      media: [],
      provider_message_id: providerMessageId,
      status: providerMessageId ? "sent" : "failed",
    })
    .select("*")
    .single();
  if (error) {
    console.error("order approval message not recorded", conversation.id);
    return null;
  }
  return toMessage(data as MessageRow);
}
