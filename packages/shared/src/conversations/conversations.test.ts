import { describe, expect, it } from "vitest";

import {
  CONVERSATION_STATE_TRANSITIONS,
  aiMayReply,
  assertConversationTransition,
  canTransitionConversation,
  conversationActorValues,
  conversationStateSchema,
  conversationStateValues,
  reopenStateFor,
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

  it("lets the system only switch an open conversation to the AI", () => {
    expect(allowedMoves("system")).toEqual(["open->ai_active"]);
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
