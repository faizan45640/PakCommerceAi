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
 * - Only a seller hands a conversation back to the AI. Approving or rejecting
 *   a draft order is a seller action, so the approval endpoint performs
 *   `waiting_approval -> ai_active` as `seller`.
 * - `system` may switch an open conversation to the AI and auto-close any live
 *   conversation (for example after days of silence). Nothing else.
 */
export const CONVERSATION_STATE_TRANSITIONS = {
  open: {
    ai_active: ["seller", "system"],
    human_takeover: ["seller"],
    closed: ["seller", "system"],
  },
  ai_active: {
    open: ["seller"],
    waiting_approval: ["ai"],
    human_takeover: ["ai", "seller"],
    closed: ["seller", "system"],
  },
  waiting_approval: {
    open: ["seller"],
    ai_active: ["seller"],
    human_takeover: ["seller"],
    closed: ["seller", "system"],
  },
  human_takeover: {
    open: ["seller"],
    ai_active: ["seller"],
    closed: ["seller", "system"],
  },
  closed: {
    open: ["buyer", "seller"],
    ai_active: ["buyer"],
  },
} as const satisfies TransitionRules;

/**
 * Flat `from -> to` edges, ignoring actors. The database only sees edges (it
 * cannot know which actor the API is acting for), so the Postgres trigger
 * enforces exactly this list and a test diffs it against the SQL. Actor rules
 * are enforced in the API with `assertConversationTransition`.
 */
export const CONVERSATION_TRANSITION_EDGES: readonly (readonly [
  ConversationState,
  ConversationState,
])[] = conversationStateValues.flatMap((from) =>
  Object.keys(CONVERSATION_STATE_TRANSITIONS[from]).map(
    (to) => [from, to as ConversationState] as const,
  ),
);

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
 * State after a new buyer message. A live conversation keeps its state (the
 * agent still only replies when `aiMayReply` says so); a closed one reopens.
 */
export function stateAfterBuyerMessage(
  state: ConversationState,
  aiEnabled: boolean,
): ConversationState {
  return state === "closed" ? reopenStateFor(aiEnabled) : state;
}

/**
 * State a closed conversation reopens into when the buyer writes again.
 * `aiEnabled` is the seller's per-workspace "let the agent answer" setting.
 */
export function reopenStateFor(aiEnabled: boolean): ConversationState {
  return aiEnabled ? "ai_active" : "open";
}
