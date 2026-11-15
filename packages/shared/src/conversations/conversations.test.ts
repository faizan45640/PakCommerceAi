import { describe, expect, it } from "vitest";

import {
  CONVERSATION_STATE_TRANSITIONS,
  CONVERSATION_TRANSITION_EDGES,
  aiMayReply,
  assertConversationTransition,
  canTransitionConversation,
  conversationActorValues,
  conversationStateSchema,
  conversationStateValues,
  reopenStateFor,
  stateAfterBuyerMessage,
  type ConversationActor,
  type ConversationState,
} from "./index.js";

function allowedMoves(actor: ConversationActor): string[] {
  const moves: string[] = [];
  for (const from of conversationStateValues) {
    for (const to of conversationStateValues) {
      if (canTransitionConversation(from, to, actor)) {
        moves.push(`${from}->${to}`);
      }
    }
  }
  return moves;
}

describe("conversation states", () => {
  it("has exactly the five inbox states", () => {
    expect(conversationStateValues).toEqual([
      "open",
      "ai_active",
      "waiting_approval",
      "human_takeover",
      "closed",
    ]);
    expect(conversationStateSchema.safeParse("ai_active").success).toBe(true);
    expect(conversationStateSchema.safeParse("pending").success).toBe(false);
  });

  it("maps every state and only references known states and actors", () => {
    expect(Object.keys(CONVERSATION_STATE_TRANSITIONS).sort()).toEqual(
      [...conversationStateValues].sort(),
    );
    for (const rules of Object.values(CONVERSATION_STATE_TRANSITIONS)) {
      for (const [to, actors] of Object.entries(rules)) {
        expect(conversationStateValues).toContain(to as ConversationState);
        for (const actor of actors as readonly string[]) {
          expect(conversationActorValues).toContain(actor as ConversationActor);
        }
      }
    }
  });

  it("rejects staying in the same state", () => {
    for (const state of conversationStateValues) {
      for (const actor of conversationActorValues) {
        expect(canTransitionConversation(state, state, actor)).toBe(false);
      }
    }
  });
});

describe("AI safety rules", () => {
  it("lets the AI only ask for approval or hand off, from ai_active", () => {
    expect(allowedMoves("ai").sort()).toEqual([
      "ai_active->human_takeover",
      "ai_active->waiting_approval",
    ]);
  });

  it("never lets the AI take a conversation back from a seller", () => {
    expect(canTransitionConversation("human_takeover", "ai_active", "ai")).toBe(false);
    expect(canTransitionConversation("waiting_approval", "ai_active", "ai")).toBe(false);
  });

  it("only lets a buyer message reopen a closed conversation", () => {
    expect(allowedMoves("buyer").sort()).toEqual(["closed->ai_active", "closed->open"]);
  });

  it("only lets a seller hand a conversation back to the AI", () => {
    for (const actor of conversationActorValues) {
      expect(canTransitionConversation("human_takeover", "ai_active", actor)).toBe(
        actor === "seller",
      );
    }
  });

  it("allows the AI to reply only while ai_active", () => {
    for (const state of conversationStateValues) {
      expect(aiMayReply(state)).toBe(state === "ai_active");
    }
  });
});

describe("seller and system moves", () => {
  it("lets a seller take over or close from any live state", () => {
    for (const from of ["open", "ai_active", "waiting_approval"] as const) {
      expect(canTransitionConversation(from, "human_takeover", "seller")).toBe(true);
    }
    for (const from of ["open", "ai_active", "waiting_approval", "human_takeover"] as const) {
      expect(canTransitionConversation(from, "closed", "seller")).toBe(true);
    }
  });

  it("lets the system only switch open to the AI or auto-close a live conversation", () => {
    expect(allowedMoves("system").sort()).toEqual([
      "ai_active->closed",
      "human_takeover->closed",
      "open->ai_active",
      "open->closed",
      "waiting_approval->closed",
    ]);
  });

  it("lets a seller release a conversation to open without handing it to the AI", () => {
    expect(canTransitionConversation("human_takeover", "open", "seller")).toBe(true);
    expect(canTransitionConversation("waiting_approval", "open", "seller")).toBe(true);
  });

  it("lets only the AI enter waiting_approval", () => {
    for (const from of conversationStateValues) {
      for (const actor of conversationActorValues) {
        expect(canTransitionConversation(from, "waiting_approval", actor)).toBe(
          from === "ai_active" && actor === "ai",
        );
      }
    }
  });

  it("reopens into the AI only when the seller has it enabled", () => {
    expect(reopenStateFor(true)).toBe("ai_active");
    expect(reopenStateFor(false)).toBe("open");
    expect(canTransitionConversation("closed", reopenStateFor(true), "buyer")).toBe(true);
    expect(canTransitionConversation("closed", reopenStateFor(false), "buyer")).toBe(true);
  });

  it("throws a readable error on an illegal move", () => {
    expect(() => assertConversationTransition("human_takeover", "ai_active", "ai")).toThrow(
      "Illegal conversation transition by ai: human_takeover → ai_active",
    );
    expect(() => assertConversationTransition("ai_active", "human_takeover", "ai")).not.toThrow();
  });
});

describe("reachability and buyer messages", () => {
  function reachable(start: ConversationState): Set<ConversationState> {
    const seen = new Set<ConversationState>([start]);
    const queue = [start];
    while (queue.length > 0) {
      const from = queue.shift()!;
      for (const [edgeFrom, to] of CONVERSATION_TRANSITION_EDGES) {
        if (edgeFrom === from && !seen.has(to)) {
          seen.add(to);
          queue.push(to);
        }
      }
    }
    return seen;
  }

  it("reaches every state from open, and every state can reach closed", () => {
    expect([...reachable("open")].sort()).toEqual([...conversationStateValues].sort());
    for (const state of conversationStateValues) {
      expect(reachable(state).has("closed")).toBe(true);
    }
  });

  it("flattens the map into from -> to edges, one per allowed pair", () => {
    const expected = conversationStateValues.flatMap((from) =>
      conversationStateValues
        .filter((to) => conversationActorValues.some((a) => canTransitionConversation(from, to, a)))
        .map((to) => `${from}->${to}`),
    );
    expect(CONVERSATION_TRANSITION_EDGES.map(([f, t]) => `${f}->${t}`).sort()).toEqual(
      expected.sort(),
    );
  });

  it("keeps a live state on a buyer message and reopens a closed one", () => {
    for (const state of ["open", "ai_active", "waiting_approval", "human_takeover"] as const) {
      expect(stateAfterBuyerMessage(state, true)).toBe(state);
      expect(stateAfterBuyerMessage(state, false)).toBe(state);
    }
    expect(stateAfterBuyerMessage("closed", true)).toBe("ai_active");
    expect(stateAfterBuyerMessage("closed", false)).toBe("open");
  });
});
