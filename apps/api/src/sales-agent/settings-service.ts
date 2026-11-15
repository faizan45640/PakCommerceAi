import type { AppSupabaseClient } from "@pakcommerce/integrations/supabase";
import type { SalesAgentSettings, SalesAgentSettingsInput } from "@pakcommerce/shared/conversations";

import { assertWorkspaceOwned } from "../conversations/conversation-service.js";
import { createApiSupabaseAdminClient } from "../lib/supabase.js";
import type { SellerContext } from "../middleware/seller-context.js";

/**
 * Sales agent settings: one row per workspace, created on the first save.
 * Reads and writes from the dashboard go through the seller's token (RLS).
 * The inbound path reads with the admin client, after the workspace is known.
 */

export const DEFAULT_SETTINGS = { aiEnabled: false, policyText: "" } as const;

function toSettings(
  workspaceId: string,
  row: { ai_enabled: boolean; policy_text: string | null } | null,
): SalesAgentSettings {
  return {
    workspaceId,
    aiEnabled: row?.ai_enabled ?? DEFAULT_SETTINGS.aiEnabled,
    policyText: row?.policy_text ?? DEFAULT_SETTINGS.policyText,
  };
}

export async function getSalesAgentSettings(
  auth: SellerContext,
  workspaceId: string,
): Promise<SalesAgentSettings> {
  await assertWorkspaceOwned(auth, workspaceId);

  const { data, error } = await auth.db
    .from("sales_agent_settings")
    .select("ai_enabled, policy_text")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message, { cause: error });

  return toSettings(workspaceId, data);
}

export async function saveSalesAgentSettings(
  auth: SellerContext,
  input: Required<SalesAgentSettingsInput>,
): Promise<SalesAgentSettings> {
  await assertWorkspaceOwned(auth, input.workspaceId);

  const policyText = input.policyText.trim();
  const values = { ai_enabled: input.aiEnabled, policy_text: policyText === "" ? null : policyText };

  // Sellers may only update ai_enabled/policy_text (column grants), so this is
  // update-then-insert rather than an upsert that would rewrite the owner columns.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const updated = await auth.db
      .from("sales_agent_settings")
      .update(values)
      .eq("workspace_id", input.workspaceId)
      .select("ai_enabled, policy_text")
      .maybeSingle();
    if (updated.error) throw new Error(updated.error.message, { cause: updated.error });
    if (updated.data) return toSettings(input.workspaceId, updated.data);

    const inserted = await auth.db
      .from("sales_agent_settings")
      .insert({ workspace_id: input.workspaceId, seller_id: auth.sellerId, ...values })
      .select("ai_enabled, policy_text")
      .single();
    if (!inserted.error) return toSettings(input.workspaceId, inserted.data);
    // 23505: a parallel save created the row first; loop to update it.
    if (inserted.error.code !== "23505") throw new Error(inserted.error.message, { cause: inserted.error });
  }
  throw new Error("Could not save sales agent settings.");
}

/**
 * Settings for the inbound path and the agent. Trusted server read (admin client).
 * Fails closed: if the read fails the AI stays off and the policy is empty, so a
 * database hiccup hands the buyer to the seller rather than letting the AI guess.
 */
export async function loadSalesAgentSettings(
  workspaceId: string,
  db?: AppSupabaseClient,
): Promise<{ aiEnabled: boolean; policyText: string }> {
  try {
    const client = db ?? createApiSupabaseAdminClient();
    const { data, error } = await client
      .from("sales_agent_settings")
      .select("ai_enabled, policy_text")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (error) throw error;
    const settings = toSettings(workspaceId, data);
    return { aiEnabled: settings.aiEnabled, policyText: settings.policyText };
  } catch {
    console.error("sales agent settings unavailable");
    return { ...DEFAULT_SETTINGS };
  }
}
