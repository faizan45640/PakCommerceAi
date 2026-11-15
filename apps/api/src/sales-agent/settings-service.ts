import type { AppSupabaseClient } from "@pakcommerce/integrations/supabase";
import type { SalesAgentSettings, SalesAgentSettingsInput } from "@pakcommerce/shared/conversations";

import { assertConversationTransition } from "@pakcommerce/shared/conversations";

import { assertWorkspaceOwned } from "../conversations/conversation-service.js";
import { createApiSupabaseAdminClient } from "../lib/supabase.js";
import type { SellerContext } from "../middleware/seller-context.js";

/**
 * Sales agent settings: one row per workspace, created on the first save.
 * Reads and writes from the dashboard go through the seller's token (RLS).
 * The inbound path reads with the admin client, after the workspace is known.
 */

export const DEFAULT_SETTINGS = { aiEnabled: false, policyText: "" } as const;

/** What a workspace without a settings row gets for the order fields. */
export const DEFAULT_ORDER_SETTINGS = { autoConfirmOrders: true, shippingFeeMinor: 0 } as const;

const SETTINGS_COLUMNS = "ai_enabled, policy_text, auto_confirm_orders, shipping_fee_minor";

interface SettingsRow {
  ai_enabled: boolean;
  policy_text: string | null;
  auto_confirm_orders: boolean;
  shipping_fee_minor: number;
}

function toSettings(workspaceId: string, row: SettingsRow | null): SalesAgentSettings {
  return {
    workspaceId,
    aiEnabled: row?.ai_enabled ?? DEFAULT_SETTINGS.aiEnabled,
    policyText: row?.policy_text ?? DEFAULT_SETTINGS.policyText,
    autoConfirmOrders: row?.auto_confirm_orders ?? DEFAULT_ORDER_SETTINGS.autoConfirmOrders,
    shippingFee: {
      amountMinor: row?.shipping_fee_minor ?? DEFAULT_ORDER_SETTINGS.shippingFeeMinor,
      currency: "PKR",
    },
  };
}

/**
 * The order settings the sales agent's tools need. Unlike `loadSalesAgentSettings`
 * this throws on a read failure: an order must not be priced or confirmed on a guess.
 */
export async function loadOrderSettings(
  db: AppSupabaseClient,
  workspaceId: string,
): Promise<{ autoConfirmOrders: boolean; shippingFeeMinor: number }> {
  const { data, error } = await db
    .from("sales_agent_settings")
    .select("auto_confirm_orders, shipping_fee_minor")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message, { cause: error });
  return {
    autoConfirmOrders: data?.auto_confirm_orders ?? DEFAULT_ORDER_SETTINGS.autoConfirmOrders,
    shippingFeeMinor: data?.shipping_fee_minor ?? DEFAULT_ORDER_SETTINGS.shippingFeeMinor,
  };
}

export async function getSalesAgentSettings(
  auth: SellerContext,
  workspaceId: string,
): Promise<SalesAgentSettings> {
  await assertWorkspaceOwned(auth, workspaceId);

  const { data, error } = await auth.db
    .from("sales_agent_settings")
    .select(SETTINGS_COLUMNS)
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
  // Turning the AI off must stop it on live threads too: hand them back as the seller.
  if (!input.aiEnabled) await stopAiOnLiveConversations(auth, input.workspaceId);

  const values = {
    ai_enabled: input.aiEnabled,
    policy_text: policyText === "" ? null : policyText,
    auto_confirm_orders: input.autoConfirmOrders,
    shipping_fee_minor: input.shippingFee.amountMinor,
  };

  // Sellers may only update ai_enabled/policy_text (column grants), so this is
  // update-then-insert rather than an upsert that would rewrite the owner columns.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const updated = await auth.db
      .from("sales_agent_settings")
      .update(values)
      .eq("workspace_id", input.workspaceId)
      .select(SETTINGS_COLUMNS)
      .maybeSingle();
    if (updated.error) throw new Error(updated.error.message, { cause: updated.error });
    if (updated.data) return toSettings(input.workspaceId, updated.data);

    const inserted = await auth.db
      .from("sales_agent_settings")
      .insert({ workspace_id: input.workspaceId, seller_id: auth.sellerId, ...values })
      .select(SETTINGS_COLUMNS)
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
      .select(SETTINGS_COLUMNS)
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

/** `ai_active -> open` as the seller for every AI conversation of the workspace (conditional update). */
async function stopAiOnLiveConversations(auth: SellerContext, workspaceId: string): Promise<void> {
  assertConversationTransition("ai_active", "open", "seller");
  const { error } = await auth.db
    .from("conversations")
    .update({ state: "open", handoff_reason: null })
    .eq("workspace_id", workspaceId)
    .eq("state", "ai_active");
  if (error) throw new Error(error.message, { cause: error });
}
