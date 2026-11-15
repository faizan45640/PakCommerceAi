import type { AppSupabaseClient } from "@pakcommerce/integrations/supabase";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SimulatorProvider } from "../whatsapp/simulator.js";
import {
  SWEEP_HANDOFF_REASON,
  sweepStaleConversations,
  describeHandoffReason,
  onInboundStored,
  scheduleAgentTurn,
  whenAgentIdle,
  type PipelineDeps,
} from "./pipeline.js";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const SELLER = "99999999-9999-4999-8999-999999999999";
const CONVERSATION = "22222222-2222-4222-8222-222222222222";
const PHONE = "+923001234567";

interface FakeState {
  conversation: { state: string; handoff_reason: string | null };
  /** Stored messages, oldest first. */
  messages: Array<Record<string, unknown>>;
  settings: { ai_enabled: boolean; policy_text: string | null } | null;
  /** Rows the stale-conversation sweep query returns. */
  stale?: Array<{ id: string; workspace_id: string }>;
  /** First insert reports an error although the row landed. */
  insertFailsOnce?: boolean;
}

/** Stateful stand-in for the admin client; understands just the queries the pipeline makes. */
function fakeDb(state: FakeState) {
  const inserted: Array<Record<string, unknown>> = [];

  function builder(table: string) {
    const filters: Record<string, unknown> = {};
    let mode: "select" | "update" | "insert" = "select";
    let patch: Record<string, unknown> = {};
    let single = false;

    const run = () => {
      if (table === "conversations") {
        const row = {
          id: CONVERSATION,
          workspace_id: WORKSPACE,
          seller_id: SELLER,
          buyer_phone: PHONE,
          state: state.conversation.state,
        };
        if (mode === "select" && !single) return { data: state.stale ?? [], error: null };
        if (mode === "update") {
          if (filters.state === state.conversation.state) Object.assign(state.conversation, patch);
          return { data: null, error: null };
        }
        return { data: row, error: null };
      }
      if (table === "sales_agent_settings") return { data: state.settings, error: null };
      if (table === "messages") {
        if (mode === "insert") {
          if (state.insertFailsOnce) {
            state.insertFailsOnce = false;
            state.messages.push({ ...inserted[inserted.length - 1]! });
            return { data: null, error: { message: "timeout" } };
          }
          return { data: null, error: null };
        }
        if (single) {
          const found =
            filters.provider_message_id !== undefined
              ? state.messages.find((m) => m.provider_message_id === filters.provider_message_id)
              : state.messages.find((m) => m.id === filters.id);
          return { data: found ?? null, error: null };
        }
        const before = String(filters.created_at_lt);
        const older = state.messages.filter((m) => String(m.created_at) < before);
        return { data: [...older].reverse().slice(0, 20), error: null };
      }
      return { data: null, error: null };
    };

    const api: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
      select: () => api,
      update: (values: Record<string, unknown>) => {
        mode = "update";
        patch = values;
        return api;
      },
      insert: (values: Record<string, unknown>) => {
        mode = "insert";
        inserted.push(values);
        return api;
      },
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return api;
      },
      lt: (_column: string, value: unknown) => {
        filters.created_at_lt = value;
        return api;
      },
      order: () => api,
      limit: () => api,
      maybeSingle: () => {
        single = true;
        return api;
      },
    };
    return api;
  }

  return { db: { from: builder } as unknown as AppSupabaseClient, inserted };
}

function inbound(id: string, body: string, minute: number) {
  return {
    id,
    direction: "inbound",
    body,
    media: [],
    status: "received",
    created_at: `2026-11-15T10:0${minute}:00.000Z`,
  };
}

const ENV = { ML_URL: "http://ml.test", AGENT_SERVICE_TOKEN: "secret-token" };

function agentOk(overrides: Record<string, unknown> = {}) {
  return {
    reply: "Yes, it is in stock.",
    intent: "product_question",
    confidence: 0.9,
    handoff: { required: false, reason: null },
    toolCalls: [],
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let state: FakeState;
let provider: SimulatorProvider;
let db: ReturnType<typeof fakeDb>;

function deps(fetchImpl: typeof fetch, extra: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    db: db.db,
    env: ENV,
    fetchImpl,
    getWhatsApp: () => ({ name: "simulator", provider, workspaceId: null }),
    ...extra,
  };
}

const turn = (messageId = "m1") => ({ workspaceId: WORKSPACE, conversationId: CONVERSATION, messageId });

beforeEach(() => {
  state = {
    conversation: { state: "ai_active", handoff_reason: null },
    messages: [inbound("m0", "Salam", 0), inbound("m1", "Is the kurta available?", 1)],
    settings: { ai_enabled: true, policy_text: "Delivery in 3 days. COD available." },
  };
  provider = new SimulatorProvider();
  db = fakeDb(state);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("agent turn", () => {
  it("replies: calls the agent with token, policy and history, sends, and stores an ai message", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(agentOk()));
    scheduleAgentTurn(turn(), deps(fetchImpl as unknown as typeof fetch));
    await whenAgentIdle();

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://ml.test/agent/respond");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      conversationId: CONVERSATION,
      message: { body: "Is the kurta available?", media: [] },
      history: [{ role: "user", content: "Salam" }],
      policyText: "Delivery in 3 days. COD available.",
      conversationState: "ai_active",
    });
    expect(JSON.stringify(body)).not.toContain(PHONE);

    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]).toMatchObject({ to: PHONE, body: "Yes, it is in stock." });
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]).toMatchObject({
      sender: "ai",
      direction: "outbound",
      status: "sent",
      body: "Yes, it is in stock.",
      seller_id: SELLER,
    });
    expect(String(db.inserted[0]!.provider_message_id)).toMatch(/^sim-/);
    expect(state.conversation.state).toBe("ai_active");
  });

  it("hands off with a short reason and sends nothing when no reply", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(agentOk({ reply: null, handoff: { required: true, reason: "buyer_needs_human" } })),
    );
    scheduleAgentTurn(turn(), deps(fetchImpl as unknown as typeof fetch));
    await whenAgentIdle();

    expect(provider.sent).toHaveLength(0);
    expect(state.conversation).toEqual({ state: "human_takeover", handoff_reason: "Buyer asked for a person" });
  });

  it("sends the reply first, then hands off (order interest)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(agentOk({ reply: "Great choice!", handoff: { required: true, reason: "order_interest" } })),
    );
    scheduleAgentTurn(turn(), deps(fetchImpl as unknown as typeof fetch));
    await whenAgentIdle();

    expect(provider.sent.map((s) => s.body)).toEqual(["Great choice!"]);
    expect(db.inserted).toHaveLength(1);
    expect(state.conversation).toEqual({ state: "human_takeover", handoff_reason: "Buyer wants to order" });
  });

  it("drops the reply when the state changed while the agent was thinking", async () => {
    const fetchImpl = vi.fn(async () => {
      state.conversation.state = "human_takeover"; // seller took over meanwhile
      return jsonResponse(agentOk());
    });
    scheduleAgentTurn(turn(), deps(fetchImpl as unknown as typeof fetch));
    await whenAgentIdle();

    expect(provider.sent).toHaveLength(0);
    expect(db.inserted).toHaveLength(0);
    expect(state.conversation.state).toBe("human_takeover");
    expect(state.conversation.handoff_reason).toBeNull();
  });

  it.each([
    ["a 500", async () => jsonResponse({ error: "boom" }, 500)],
    ["a network error", async () => Promise.reject(new TypeError("fetch failed"))],
    ["an invalid body", async () => jsonResponse({ nope: true })],
    ["no reply and no handoff", async () => jsonResponse(agentOk({ reply: null }))],
  ])("hands off with 'AI unavailable' on %s", async (_name, impl) => {
    scheduleAgentTurn(turn(), deps(vi.fn(impl) as unknown as typeof fetch));
    await whenAgentIdle();

    expect(provider.sent).toHaveLength(0);
    expect(db.inserted).toHaveLength(0);
    expect(state.conversation).toEqual({ state: "human_takeover", handoff_reason: "AI unavailable" });
  });

  it("hands off when the agent times out", async () => {
    const hang = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "TimeoutError")));
        }),
    );
    scheduleAgentTurn(turn(), deps(hang as unknown as typeof fetch, { timeoutMs: 20 }));
    await whenAgentIdle();

    expect(state.conversation.handoff_reason).toBe("AI unavailable");
  });

  it("hands off when ML_URL or the token is missing, without calling out", async () => {
    const fetchImpl = vi.fn();
    scheduleAgentTurn(turn(), deps(fetchImpl as unknown as typeof fetch, { env: {} }));
    await whenAgentIdle();

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(state.conversation).toEqual({ state: "human_takeover", handoff_reason: "AI unavailable" });
  });

  it("stores a failed ai message and hands off when the provider cannot send", async () => {
    provider.sendText = async () => {
      throw new Error("down");
    };
    const fetchImpl = vi.fn(async () => jsonResponse(agentOk()));
    scheduleAgentTurn(turn(), deps(fetchImpl as unknown as typeof fetch));
    await whenAgentIdle();

    expect(db.inserted[0]).toMatchObject({ sender: "ai", status: "failed", provider_message_id: null });
    expect(state.conversation.state).toBe("human_takeover");
  });

  it("skips the turn silently when the seller turned the AI off", async () => {
    state.settings = { ai_enabled: false, policy_text: null };
    const fetchImpl = vi.fn();
    scheduleAgentTurn(turn(), deps(fetchImpl as unknown as typeof fetch));
    await whenAgentIdle();

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(provider.sent).toHaveLength(0);
    expect(state.conversation).toEqual({ state: "ai_active", handoff_reason: null });
  });

  it("does not insert the ai message twice when the first insert landed despite an error", async () => {
    state.insertFailsOnce = true;
    const fetchImpl = vi.fn(async () => jsonResponse(agentOk()));
    scheduleAgentTurn(turn(), deps(fetchImpl as unknown as typeof fetch));
    await whenAgentIdle();

    expect(db.inserted).toHaveLength(1);
    expect(state.conversation.state).toBe("ai_active");
  });

  it("does nothing when the conversation is no longer ai_active at turn start", async () => {
    state.conversation.state = "human_takeover";
    const fetchImpl = vi.fn();
    scheduleAgentTurn(turn(), deps(fetchImpl as unknown as typeof fetch));
    await whenAgentIdle();

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(state.conversation.handoff_reason).toBeNull();
  });

  it("runs two inbound messages in a row as two ordered, non-overlapping turns", async () => {
    state.messages.push(inbound("m2", "And the price?", 2));
    const log: string[] = [];
    let active = 0;
    let overlapped = false;
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      active += 1;
      overlapped ||= active > 1;
      const asked = JSON.parse(String(init.body)).message.body as string;
      log.push(`start ${asked}`);
      await new Promise((r) => setTimeout(r, asked.startsWith("Is") ? 30 : 1));
      log.push(`end ${asked}`);
      active -= 1;
      return jsonResponse(agentOk({ reply: `re: ${asked}` }));
    });

    const d = deps(fetchImpl as unknown as typeof fetch);
    scheduleAgentTurn(turn("m1"), d);
    scheduleAgentTurn(turn("m2"), d);
    await whenAgentIdle();

    expect(overlapped).toBe(false);
    expect(log).toEqual([
      "start Is the kurta available?",
      "end Is the kurta available?",
      "start And the price?",
      "end And the price?",
    ]);
    expect(provider.sent.map((s) => s.body)).toEqual(["re: Is the kurta available?", "re: And the price?"]);
  });
});

describe("onInboundStored", () => {
  const result = (over: Partial<Parameters<typeof onInboundStored>[0]> = {}) => ({
    conversationId: CONVERSATION,
    messageId: "m1",
    duplicate: false,
    state: "ai_active" as const,
    ...over,
  });

  it("never starts a turn for a duplicate", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(agentOk()));
    onInboundStored(result({ duplicate: true }), WORKSPACE, deps(fetchImpl as unknown as typeof fetch));
    await whenAgentIdle();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(["open", "human_takeover", "waiting_approval", "closed"] as const)(
    "never starts a turn in %s",
    async (conversationState) => {
      const fetchImpl = vi.fn(async () => jsonResponse(agentOk()));
      onInboundStored(result({ state: conversationState }), WORKSPACE, deps(fetchImpl as unknown as typeof fetch));
      await whenAgentIdle();
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it("starts a turn for a new message in ai_active", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(agentOk()));
    onInboundStored(result(), WORKSPACE, deps(fetchImpl as unknown as typeof fetch));
    await whenAgentIdle();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("is switched off by SALES_AGENT_PIPELINE=off", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(agentOk()));
    onInboundStored(result(), WORKSPACE, deps(fetchImpl as unknown as typeof fetch, { env: { ...ENV, SALES_AGENT_PIPELINE: "off" } }));
    await whenAgentIdle();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("describeHandoffReason", () => {
  it("maps agent codes to short text", () => {
    expect(describeHandoffReason("policy_unavailable")).toBe("Store policy is not set up");
    expect(describeHandoffReason("low_confidence:0.31")).toBe("AI was not confident");
    expect(describeHandoffReason("something_new")).toBe("AI handed off");
    expect(describeHandoffReason(null)).toBe("AI handed off");
  });
});

describe("sweepStaleConversations", () => {
  it("hands off stale unanswered conversations without calling the agent", async () => {
    state.stale = [{ id: CONVERSATION, workspace_id: WORKSPACE }];
    const fetchImpl = vi.fn();
    const count = await sweepStaleConversations(deps(fetchImpl as unknown as typeof fetch));

    expect(count).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(state.conversation).toEqual({ state: "human_takeover", handoff_reason: SWEEP_HANDOFF_REASON });
  });

  it("skips conversations with a queued turn", async () => {
    state.stale = [{ id: CONVERSATION, workspace_id: WORKSPACE }];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow = vi.fn(async () => {
      await gate;
      return jsonResponse(agentOk());
    });
    scheduleAgentTurn(turn(), deps(slow as unknown as typeof fetch));
    await vi.waitFor(() => expect(slow).toHaveBeenCalled());

    expect(await sweepStaleConversations(deps(slow as unknown as typeof fetch))).toBe(0);
    release();
    await whenAgentIdle();
    expect(state.conversation.state).toBe("ai_active");
  });

  it("is off with SALES_AGENT_PIPELINE=off", async () => {
    state.stale = [{ id: CONVERSATION, workspace_id: WORKSPACE }];
    expect(await sweepStaleConversations({ db: db.db, env: { SALES_AGENT_PIPELINE: "off" } })).toBe(0);
    expect(state.conversation.state).toBe("ai_active");
  });
});
