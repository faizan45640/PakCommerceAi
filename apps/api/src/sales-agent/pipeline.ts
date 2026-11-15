import type { AppSupabaseClient } from "@pakcommerce/integrations/supabase";
import {
  MAX_MESSAGE_BODY_LENGTH,
  aiMayReply,
  assertConversationTransition,
  conversationStateSchema,
  type ConversationState,
} from "@pakcommerce/shared/conversations";
import { z } from "zod";

import { createApiSupabaseAdminClient } from "../lib/supabase.js";
import { getActiveWhatsApp, type ActiveWhatsApp } from "../whatsapp/factory.js";
import { loadSalesAgentSettings } from "./settings-service.js";

/**
 * AI reply pipeline (T-079): inbound buyer message -> sales agent (apps/ml) ->
 * reply through the active WhatsApp provider.
 *
 * A turn runs in the background after the inbound message is stored, so the
 * webhook (or mock endpoint) answers immediately. Turns for one conversation
 * run one at a time, in arrival order, through an in-process queue keyed by
 * conversation id.
 *
 * MULTI-INSTANCE: the queue lives in this process. With more than one API
 * instance two turns for the same conversation could overlap; a database lock
 * (advisory lock or a claimed-turn row) is needed before scaling out. The
 * fresh state re-read before sending and the conditional hand-off update keep
 * an overlap from corrupting state, but could produce two replies.
 *
 * SAFETY: the agent only replies while the conversation is `ai_active`
 * (`aiMayReply`) and the state is re-read right before sending. If anything goes
 * wrong the conversation is handed to the seller (`human_takeover`) instead of
 * leaving the buyer unanswered. Logs carry ids and codes only, never message text.
 */

export const AGENT_TIMEOUT_MS = 45_000;
export const HISTORY_LIMIT = 20;
export const AI_UNAVAILABLE = "AI unavailable";

export interface AgentTurnInput {
  workspaceId: string;
  conversationId: string;
  /** The stored inbound message this turn answers. */
  messageId: string;
}

export interface PipelineDeps {
  /** Service-role client. Defaults to the API's admin client. */
  db?: AppSupabaseClient;
  getWhatsApp?: () => ActiveWhatsApp | null;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

const agentResponseSchema = z.object({
  reply: z.string().nullable(),
  intent: z.string().nullish(),
  confidence: z.number().optional(),
  handoff: z.object({ required: z.boolean(), reason: z.string().nullish() }),
  toolCalls: z.array(z.unknown()).optional(),
});

type AgentResponse = z.infer<typeof agentResponseSchema>;

const HANDOFF_TEXT: Record<string, string> = {
  agent_error: "AI hit an error",
  buyer_needs_human: "Buyer asked for a person",
  policy_unavailable: "Store policy is not set up",
  policy_not_covered: "Question not covered by store policy",
  tools_unavailable: "AI could not look up store data",
  empty_reply: "AI had no answer",
  order_interest: "Buyer wants to order",
  tool_loop_limit: "AI could not finish the lookup",
};

/** Short human text for the agent's machine-readable handoff reason. */
export function describeHandoffReason(code: string | null | undefined): string {
  if (!code) return "AI handed off";
  if (code.startsWith("low_confidence")) return "AI was not confident";
  return HANDOFF_TEXT[code] ?? "AI handed off";
}

// --- queue -----------------------------------------------------------------

const tails = new Map<string, Promise<void>>();
const inflight = new Set<Promise<void>>();

/** Resolves when every queued or running turn has finished. For tests. */
export async function whenAgentIdle(): Promise<void> {
  while (inflight.size > 0) await Promise.allSettled([...inflight]);
}

/** `SALES_AGENT_PIPELINE=off` disables the pipeline (used by tests that do not want it). */
function pipelineDisabled(env: NodeJS.ProcessEnv): boolean {
  return env.SALES_AGENT_PIPELINE?.trim().toLowerCase() === "off";
}

/** Queues a turn behind any earlier turn for the same conversation. Never throws. */
export function scheduleAgentTurn(input: AgentTurnInput, deps: PipelineDeps = {}): void {
  if (pipelineDisabled(deps.env ?? process.env)) return;

  const previous = tails.get(input.conversationId) ?? Promise.resolve();
  const next = previous.then(() => runAgentTurn(input, deps));
  tails.set(input.conversationId, next);
  inflight.add(next);
  void next.finally(() => {
    inflight.delete(next);
    if (tails.get(input.conversationId) === next) tails.delete(input.conversationId);
  });
}

/**
 * Called after an inbound message is stored. Duplicates and conversations the
 * AI does not hold never start a turn.
 */
export function onInboundStored(
  result: { conversationId: string; messageId: string; duplicate: boolean; state: ConversationState },
  workspaceId: string,
  deps: PipelineDeps = {},
): void {
  if (result.duplicate || !aiMayReply(result.state)) return;
  scheduleAgentTurn({ workspaceId, conversationId: result.conversationId, messageId: result.messageId }, deps);
}

// --- one turn ----------------------------------------------------------------

interface ConversationRow {
  id: string;
  workspace_id: string;
  seller_id: string;
  buyer_phone: string;
  state: string;
}

async function readConversation(db: AppSupabaseClient, input: AgentTurnInput): Promise<ConversationRow | null> {
  const { data, error } = await db
    .from("conversations")
    .select("id, workspace_id, seller_id, buyer_phone, state")
    .eq("id", input.conversationId)
    .eq("workspace_id", input.workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message, { cause: error });
  return data;
}

/** Never throws; any failure of the turn ends with a hand-off, not a crash. */
export async function runAgentTurn(input: AgentTurnInput, deps: PipelineDeps = {}): Promise<void> {
  try {
    const db = deps.db ?? createApiSupabaseAdminClient();
    await runTurn(db, input, deps);
  } catch (error) {
    console.error("agent turn failed", input.conversationId, error instanceof Error ? error.name : "error");
    try {
      await handOff(deps.db ?? createApiSupabaseAdminClient(), input, AI_UNAVAILABLE);
    } catch {
      console.error("agent hand-off failed", input.conversationId);
    }
  }
}

async function runTurn(db: AppSupabaseClient, input: AgentTurnInput, deps: PipelineDeps): Promise<void> {
  const conversation = await readConversation(db, input);
  if (!conversation || !aiMayReply(parseState(conversation.state))) return;

  const { data: trigger, error: triggerError } = await db
    .from("messages")
    .select("body, media, created_at")
    .eq("id", input.messageId)
    .eq("conversation_id", input.conversationId)
    .maybeSingle();
  if (triggerError) throw new Error(triggerError.message, { cause: triggerError });
  if (!trigger) return;

  // Kill switch: the seller turned the AI off after this message was queued.
  const settings = await loadSalesAgentSettings(input.workspaceId, db);
  if (!settings.aiEnabled) return;

  const history = await loadHistory(db, input.conversationId, input.messageId, trigger.created_at);

  const response = await callAgent(
    {
      conversationId: input.conversationId,
      message: {
        body: trigger.body ?? "",
        media: (Array.isArray(trigger.media) ? trigger.media : []).map((item) => ({
          contentType: String((item as { contentType?: unknown }).contentType ?? ""),
        })),
      },
      history,
      ...(settings.policyText ? { policyText: settings.policyText } : {}),
      conversationState: "ai_active",
    },
    input.conversationId,
    deps,
  );

  // Unusable answer: never leave the buyer unanswered silently.
  const reply = response ? cleanReply(response.reply) : null;
  if (!response || (!reply && !response.handoff.required)) {
    await handOff(db, input, AI_UNAVAILABLE);
    return;
  }

  if (reply) {
    // State may have changed while the model was thinking (seller took over).
    const fresh = await readConversation(db, input);
    if (!fresh || !aiMayReply(parseState(fresh.state))) {
      console.info("agent reply dropped: state changed", input.conversationId);
      return;
    }
    const sent = await sendAndStore(db, fresh, reply, deps);
    if (!sent) {
      await handOff(db, input, "AI reply could not be sent");
      return;
    }
  }

  if (response.handoff.required) {
    await handOff(db, input, describeHandoffReason(response.handoff.reason));
  }
}

function parseState(value: string): ConversationState {
  return conversationStateSchema.parse(value);
}

function cleanReply(reply: string | null): string | null {
  const text = reply?.trim() ?? "";
  return text === "" ? null : text.slice(0, MAX_MESSAGE_BODY_LENGTH);
}

/**
 * The conversation so far, oldest first, as the agent should see it for this
 * turn: buyer messages sent before the trigger, plus every reply already sent,
 * even one stored after the trigger. When a buyer sends two messages quickly,
 * both are stored before the first reply, and the second turn must still see
 * that reply. Later buyer messages are left out; their own turn answers them.
 * No phones, only role and text.
 */
async function loadHistory(
  db: AppSupabaseClient,
  conversationId: string,
  triggerId: string,
  triggerAt: string,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const { data, error } = await db
    .from("messages")
    .select("direction, body, status")
    .eq("conversation_id", conversationId)
    .neq("id", triggerId)
    .or(`created_at.lt."${triggerAt}",direction.eq.outbound`)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw new Error(error.message, { cause: error });

  return (data ?? [])
    .filter((row) => row.status !== "failed" && (row.body ?? "").trim() !== "")
    .reverse()
    .map((row) => ({
      role: row.direction === "inbound" ? ("user" as const) : ("assistant" as const),
      content: row.body ?? "",
    }));
}

/** The agent's answer, or null when it is unreachable, slow, or answers badly. */
async function callAgent(
  body: Record<string, unknown>,
  conversationId: string,
  deps: PipelineDeps,
): Promise<AgentResponse | null> {
  const env = deps.env ?? process.env;
  const baseUrl = env.ML_URL?.trim();
  const token = env.AGENT_SERVICE_TOKEN?.trim();
  if (!baseUrl || !token) {
    console.error("agent not configured", conversationId, "missing_config");
    return null;
  }

  try {
    const res = await (deps.fetchImpl ?? fetch)(`${baseUrl.replace(/\/+$/, "")}/agent/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(deps.timeoutMs ?? AGENT_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("agent call failed", conversationId, res.status);
      return null;
    }
    const parsed = agentResponseSchema.safeParse(await res.json());
    if (!parsed.success) {
      console.error("agent response invalid", conversationId);
      return null;
    }
    return parsed.data;
  } catch (error) {
    console.error("agent call failed", conversationId, error instanceof Error ? error.name : "error");
    return null;
  }
}

/** Sends through the active provider, then records the outbound `ai` message. True when it was delivered to the provider. */
async function sendAndStore(
  db: AppSupabaseClient,
  conversation: ConversationRow,
  body: string,
  deps: PipelineDeps,
): Promise<boolean> {
  const active = (deps.getWhatsApp ?? getActiveWhatsApp)();
  // Spike: a connected number belongs to one workspace; null means any (simulator).
  const usable = active && (active.workspaceId === null || active.workspaceId === conversation.workspace_id);

  let providerMessageId: string | null = null;
  if (usable) {
    try {
      providerMessageId = await active.provider.sendText(conversation.buyer_phone, body);
    } catch (error) {
      const code = (error as { code?: unknown; status?: unknown }).code ?? (error as { status?: unknown }).status;
      console.error("agent send failed", conversation.id, code ?? "unknown");
    }
  } else {
    console.error("agent send failed", conversation.id, "no_provider");
  }

  const row = {
    workspace_id: conversation.workspace_id,
    seller_id: conversation.seller_id,
    conversation_id: conversation.id,
    direction: "outbound" as const,
    sender: "ai" as const,
    body,
    media: [],
    provider_message_id: providerMessageId,
    status: providerMessageId ? ("sent" as const) : ("failed" as const),
  };

  // Append-only table: insert after the send so the provider id is known. Retry once.
  let saved = false;
  for (let attempt = 0; attempt < 2 && !saved; attempt += 1) {
    if (attempt > 0 && providerMessageId) {
      // The first insert may have landed even though it reported an error.
      const existing = await db
        .from("messages")
        .select("id")
        .eq("conversation_id", conversation.id)
        .eq("provider_message_id", providerMessageId)
        .maybeSingle();
      if (existing.data) {
        saved = true;
        break;
      }
    }
    const { error } = await db.from("messages").insert(row);
    saved = !error;
  }

  if (!saved) console.error("agent reply sent but not recorded", conversation.id);

  return providerMessageId !== null;
}

/** `ai_active -> human_takeover` as the AI, conditional on the state still being `ai_active`. */
async function handOff(db: AppSupabaseClient, input: AgentTurnInput, reason: string): Promise<void> {
  assertConversationTransition("ai_active", "human_takeover", "ai");

  const { error } = await db
    .from("conversations")
    .update({ state: "human_takeover", handoff_reason: reason })
    .eq("id", input.conversationId)
    .eq("workspace_id", input.workspaceId)
    .eq("state", "ai_active");
  // No matching row means the state already moved (seller took over): nothing to do.
  if (error) throw new Error(error.message, { cause: error });
}

// --- restart recovery --------------------------------------------------------

export const SWEEP_INTERVAL_MS = 60_000;
export const STALE_AFTER_MS = 2 * 60_000;
export const SWEEP_HANDOFF_REASON = "AI didn't answer in time";

/**
 * Hands off `ai_active` conversations whose newest message is an unanswered
 * buyer message older than two minutes and that have no queued turn (for
 * example the API restarted mid-turn). The agent is not re-run: a seller picks
 * it up. Returns how many conversations were handed off. Never throws.
 */
export async function sweepStaleConversations(deps: PipelineDeps = {}, now = Date.now()): Promise<number> {
  if (pipelineDisabled(deps.env ?? process.env)) return 0;
  try {
    const db = deps.db ?? createApiSupabaseAdminClient();
    const { data, error } = await db
      .from("conversations")
      .select("id, workspace_id")
      .eq("state", "ai_active")
      .eq("last_message_sender", "buyer")
      .lt("last_message_at", new Date(now - STALE_AFTER_MS).toISOString())
      .limit(100);
    if (error) throw new Error(error.message, { cause: error });

    let handedOff = 0;
    for (const row of data ?? []) {
      if (tails.has(row.id)) continue;
      await handOff(db, { workspaceId: row.workspace_id, conversationId: row.id, messageId: "" }, SWEEP_HANDOFF_REASON);
      handedOff += 1;
    }
    return handedOff;
  } catch (error) {
    console.error("agent sweep failed", error instanceof Error ? error.name : "error");
    return 0;
  }
}

/** Sweeps now and every minute. The timer does not keep the process alive. */
export function startAgentSweep(deps: PipelineDeps = {}): NodeJS.Timeout | null {
  if (pipelineDisabled(deps.env ?? process.env)) return null;
  void sweepStaleConversations(deps);
  const timer = setInterval(() => void sweepStaleConversations(deps), SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
}
