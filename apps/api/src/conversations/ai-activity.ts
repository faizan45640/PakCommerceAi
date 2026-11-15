import {
  AI_ACTIVITY_TOOL_CALL_LIMIT,
  CONVERSATION_PREVIEW_LENGTH,
  aiActivitySchema,
  type AiActivity,
} from "@pakcommerce/shared/conversations";

import type { SellerContext } from "../middleware/seller-context.js";
import { getConversation } from "./conversation-service.js";

/**
 * What the AI did in one conversation: state, handoff reason, last AI message
 * and the latest tool calls. Reads only through the seller's token (RLS), and
 * never selects tool `input`, so nothing the buyer typed leaks through here.
 */
export async function getAiActivity(
  auth: SellerContext,
  workspaceId: string,
  conversationId: string,
): Promise<AiActivity> {
  // 404 for another seller's (or another workspace's) conversation.
  const conversation = await getConversation(auth, workspaceId, conversationId);

  const [lastMessage, toolCalls] = await Promise.all([
    auth.db
      .from("messages")
      .select("body, created_at")
      .eq("conversation_id", conversationId)
      .eq("sender", "ai")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    auth.db
      .from("ai_tool_calls")
      .select("tool_name, ok, error_code, duration_ms, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(AI_ACTIVITY_TOOL_CALL_LIMIT),
  ]);

  if (lastMessage.error) throw new Error(lastMessage.error.message, { cause: lastMessage.error });
  if (toolCalls.error) throw new Error(toolCalls.error.message, { cause: toolCalls.error });

  const body = lastMessage.data?.body?.trim() ?? "";

  return aiActivitySchema.parse({
    state: conversation.state,
    handoffReason: conversation.handoffReason,
    stateChangedAt: conversation.stateChangedAt,
    lastAiMessageAt: lastMessage.data?.created_at ?? null,
    lastAiMessagePreview: body ? body.slice(0, CONVERSATION_PREVIEW_LENGTH) : null,
    recentToolCalls: (toolCalls.data ?? []).map((row) => ({
      tool: row.tool_name,
      ok: row.ok,
      errorCode: row.error_code,
      durationMs: row.duration_ms,
      at: row.created_at,
    })),
  });
}
