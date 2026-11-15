import { getSupabaseConfigFromEnv } from "@pakcommerce/integrations/supabase";

import { createApiSupabaseAdminClient } from "../lib/supabase.js";
import type { ToolAuditEntry, ToolAuditSink } from "./registry.js";

/**
 * Writes tool-call audit rows to `ai_tool_calls` with the service role (sellers
 * may only read that table). Skips quietly when Supabase is not configured, so
 * unit tests that never touch a database do not need it.
 */
export const databaseToolAudit: ToolAuditSink = {
  async record(entry: ToolAuditEntry) {
    const config = getSupabaseConfigFromEnv();
    if (!config?.serviceRoleKey) return;
    if (!entry.sellerId) return;

    const { error } = await createApiSupabaseAdminClient()
      .from("ai_tool_calls")
      .insert({
        ...(entry.id ? { id: entry.id } : {}),
        seller_id: entry.sellerId,
        workspace_id: entry.workspaceId,
        conversation_id: entry.conversationId,
        tool_name: entry.toolName,
        audience: entry.audience,
        actor: entry.actor,
        ok: entry.ok,
        error_code: entry.errorCode,
        duration_ms: entry.durationMs,
        input: entry.input as never,
      });
    if (error) throw new Error(error.message);
  },
};
