import { z } from "zod";

/**
 * Conversation states for the WhatsApp inbox.
 *
 * - `open`: a live conversation nobody is handling yet (AI is off for it).
 * - `ai_active`: the Sales Agent is answering the buyer.
 * - `waiting_approval`: the agent proposed an action (for example a draft
 *   order) that a seller must approve. The agent stays silent until then.
 * - `human_takeover`: a seller is replying. The agent stays silent.
 * - `closed`: resolved. A new buyer message reopens it.
 */
export const conversationStateValues = [
  "open",
  "ai_active",
  "waiting_approval",
  "human_takeover",
  "closed",
] as const;

/** Who caused a state change. `buyer` means a new inbound message. */
export const conversationActorValues = ["buyer", "ai", "seller", "system"] as const;

export const conversationStateSchema = z.enum(conversationStateValues);
export const conversationActorSchema = z.enum(conversationActorValues);

export type ConversationState = z.infer<typeof conversationStateSchema>;
export type ConversationActor = z.infer<typeof conversationActorSchema>;

type TransitionRules = {
  readonly [From in ConversationState]: {
    readonly [To in ConversationState]?: readonly ConversationActor[];
  };
};

/**
 * Closed transition map: `from -> to -> actors allowed to make that move`.
 *
 * The safety rules live here:
 * - The AI can only leave `ai_active`, and only to ask for approval or hand
 *   off. It can never take a conversation back from a seller, approve its own
 *   request, reopen, or close.
 * - A buyer message can only reopen a closed conversation.
 * - Only a seller can hand a conversation back to the AI.
 */
export const CONVERSATION_STATE_TRANSITIONS = {
  open: {
    ai_active: ["seller", "system"],
    human_takeover: ["seller"],
    closed: ["seller"],
  },
  ai_active: {
    open: ["seller"],
    waiting_approval: ["ai"],
    human_takeover: ["ai", "seller"],
    closed: ["seller"],
  },
  waiting_approval: {
    ai_active: ["seller"],
    human_takeover: ["seller"],
    closed: ["seller"],
  },
  human_takeover: {
    ai_active: ["seller"],
    closed: ["seller"],
  },
  closed: {
    open: ["buyer", "seller"],
    ai_active: ["buyer"],
  },
} as const satisfies TransitionRules;

export const conversationContractVersion = "2026-11-15";

export function canTransitionConversation(
  from: ConversationState,
  to: ConversationState,
  actor: ConversationActor,
): boolean {
  if (from === to) {
    return false;
  }

  const rules = CONVERSATION_STATE_TRANSITIONS[from] as TransitionRules[ConversationState];
  const actors = rules[to];
  return actors !== undefined && actors.includes(actor);
}

export function assertConversationTransition(
  from: ConversationState,
  to: ConversationState,
  actor: ConversationActor,
): void {
  if (!canTransitionConversation(from, to, actor)) {
    throw new Error(`Illegal conversation transition by ${actor}: ${from} → ${to}`);
  }
}

/** The agent may send a message only while it holds the conversation. */
export function aiMayReply(state: ConversationState): boolean {
  return state === "ai_active";
}

/**
 * State a closed conversation reopens into when the buyer writes again.
 * `aiEnabled` is the seller's per-workspace "let the agent answer" setting.
 */
export function reopenStateFor(aiEnabled: boolean): ConversationState {
  return aiEnabled ? "ai_active" : "open";
}
