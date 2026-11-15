import type { AiActivity, ConversationState } from "@pakcommerce/shared/conversations";

import type { StatusTone } from "@/components/dashboard/status-badge";

import { relativeTime } from "./conversation-display";

export const AI_STATE_HEADLINES: Record<ConversationState, string> = {
  open: "AI off",
  ai_active: "AI is replying",
  waiting_approval: "Waiting for your approval",
  human_takeover: "You're handling this — AI paused",
  closed: "Closed",
};

export const AI_STATE_TONES: Record<ConversationState, StatusTone> = {
  open: "neutral",
  ai_active: "success",
  waiting_approval: "warning",
  human_takeover: "info",
  closed: "neutral",
};

/** Plain-words names for known tools; others are humanised. */
const TOOL_LABELS: Record<string, string> = {
  search_products: "Product search",
  check_stock: "Checked stock",
  get_product: "Product lookup",
  create_draft_order: "Draft order",
};

export function toolLabel(tool: string): string {
  const known = TOOL_LABELS[tool];
  if (known) return known;
  const words = tool.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : tool;
}

/** "AI handed over: buyer asked for a person"; null outside human takeover or without a reason. */
export function handoffLine(state: ConversationState, reason: string | null): string | null {
  if (state !== "human_takeover") return null;
  const text = reason?.trim();
  return text ? `AI handed over: ${text}` : null;
}

/**
 * The most recent thing the AI did: its latest tool call or message, whichever
 * is newer. Null when the AI has done nothing here.
 */
export function lastAiActionLine(
  activity: Pick<AiActivity, "lastAiMessageAt" | "recentToolCalls">,
  now: Date = new Date(),
): string | null {
  const tool = activity.recentToolCalls[0];
  const messageAt = activity.lastAiMessageAt;
  const toolIsNewer = tool && (!messageAt || new Date(tool.at).getTime() > new Date(messageAt).getTime());

  if (toolIsNewer) {
    const label = toolLabel(tool.tool);
    return tool.ok ? `${label}: ok` : `${label} failed`;
  }
  if (messageAt) return `Replied ${relativeTime(messageAt, now)}`;
  return null;
}
