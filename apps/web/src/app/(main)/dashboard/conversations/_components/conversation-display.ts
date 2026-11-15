import { formatDistanceStrict } from "date-fns";
import type { ConversationState, MessageSender } from "@pakcommerce/shared/conversations";

import type { StatusTone } from "@/components/dashboard/status-badge";

export const CONVERSATION_STATE_LABELS: Record<ConversationState, string> = {
  open: "Open",
  ai_active: "AI replying",
  waiting_approval: "Needs approval",
  human_takeover: "You're handling",
  closed: "Closed",
};

export const CONVERSATION_STATE_TONES: Record<ConversationState, StatusTone> = {
  open: "info",
  ai_active: "success",
  waiting_approval: "warning",
  human_takeover: "neutral",
  closed: "neutral",
};

export const MESSAGE_SENDER_LABELS: Record<MessageSender, string> = {
  buyer: "Buyer",
  ai: "AI",
  seller: "You",
  system: "System",
};

/** Formats a normalised Pakistani number as `+92 300 1234567`; anything else is returned as is. */
export function formatPhone(phone: string): string {
  const match = /^\+92(\d{3})(\d{7})$/.exec(phone);
  return match ? `+92 ${match[1]} ${match[2]}` : phone;
}

/** The buyer's WhatsApp name, or their formatted phone when they have none. */
export function buyerDisplayName(buyer: { buyerName: string | null; buyerPhone: string }): string {
  return buyer.buyerName?.trim() || formatPhone(buyer.buyerPhone);
}

/** "5 minutes ago"; empty when there is no timestamp. */
export function relativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (now.getTime() - date.getTime() < 60_000) return "just now";
  return `${formatDistanceStrict(date, now)} ago`;
}
