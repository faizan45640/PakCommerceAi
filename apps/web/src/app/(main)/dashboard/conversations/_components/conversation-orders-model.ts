import type { Conversation } from "@pakcommerce/shared/conversations";

import { ApiRequestError } from "@/lib/api/api-client";
import type { OrderApprovalDecision } from "@/lib/api/conversations";
import type { OrderAiFields } from "@/lib/api/orders";

/** The AI draft awaiting the seller: the first `draft` order the WhatsApp AI created. */
export function pickPendingDraft<T extends OrderAiFields & { status: string }>(orders: readonly T[]): T | null {
  return orders.find((order) => order.status === "draft" && order.createdVia === "whatsapp_ai") ?? null;
}

export function isWaitingApproval(conversation: Pick<Conversation, "state"> | null | undefined): boolean {
  return conversation?.state === "waiting_approval";
}

export function approvalSuccessMessage(decision: OrderApprovalDecision): string {
  return decision === "approve"
    ? "Order approved. The AI will continue the chat."
    : "Order rejected. You have taken over the chat.";
}

/** 409: the conversation moved on (or the order changed) while the card was open; refetch instead of failing. */
export function isStaleApproval(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 409;
}

/** Changes whenever the orders of a chat may have changed. */
export function ordersRefreshKey(
  refreshTick: number,
  updated: Pick<Conversation, "id" | "state" | "updatedAt"> | null | undefined,
  conversationId: string,
): string {
  const own = updated && updated.id === conversationId ? `${updated.state}:${updated.updatedAt}` : "";
  return `${refreshTick}|${own}`;
}
