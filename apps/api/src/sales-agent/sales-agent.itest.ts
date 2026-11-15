/**
 * Tier 2 - sales agent settings and the AI reply pipeline, end to end.
 *
 * Real Express app, real JWTs, real Postgres (RLS, ingest RPC, triggers). The
 * agent service (apps/ml) is a local HTTP stub, and WhatsApp is the simulator.
 *
 * Requires the local Supabase stack: `npx supabase start`.
 */

import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { createSupabaseClient } from "@pakcommerce/integrations/supabase";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { createApiSupabaseUserClient } from "../lib/supabase.js";
import type { TestSeller } from "../testing/api-test-env.js";
import {
  applyTestEnv,
  createTestSeller,
  deleteTestSeller,
  LOCAL_ANON_KEY,
  LOCAL_SUPABASE_URL,
} from "../testing/api-test-env.js";
import { whenAgentIdle } from "./pipeline.js";

const app = () => createApp();
const SETTINGS = "/api/v1/sales-agent/settings";
const TOKEN = "itest-agent-token";

let alice: TestSeller;
let bob: TestSeller;
let ml: Server;
let agentCalls: Array<{ auth: string | undefined; body: Record<string, unknown> }>;
let agentAnswer: { status: number; body: unknown };
const saved: Record<string, string | undefined> = {};

beforeAll(async () => {
  applyTestEnv();
  ml = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      agentCalls.push({ auth: req.headers.authorization, body: JSON.parse(raw) });
      res.writeHead(agentAnswer.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(agentAnswer.body));
    });
  });
  await new Promise<void>((resolve) => ml.listen(0, "127.0.0.1", resolve));

  for (const key of ["ML_URL", "AGENT_SERVICE_TOKEN", "WHATSAPP_PROVIDER", "WHATSAPP_WORKSPACE_ID", "SALES_AGENT_PIPELINE"]) {
    saved[key] = process.env[key];
  }
  process.env.ML_URL = `http://127.0.0.1:${(ml.address() as AddressInfo).port}`;
  process.env.AGENT_SERVICE_TOKEN = TOKEN;
  process.env.WHATSAPP_PROVIDER = "simulator";
  delete process.env.WHATSAPP_WORKSPACE_ID;
  process.env.SALES_AGENT_PIPELINE = "on";
});

afterAll(async () => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await new Promise<void>((resolve) => ml.close(() => resolve()));
});

beforeEach(async () => {
  agentCalls = [];
  agentAnswer = {
    status: 200,
    body: { reply: "Yes, in stock.", intent: "product_question", confidence: 0.9, handoff: { required: false, reason: null }, toolCalls: [] },
  };
  alice = await createTestSeller("alice");
  bob = await createTestSeller("bob");
});

afterEach(async () => {
  await whenAgentIdle();
  await deleteTestSeller(alice);
  await deleteTestSeller(bob);
});

const as = (seller: TestSeller, method: "get" | "put" | "post", path: string) =>
  request(app())[method](path).set("Authorization", `Bearer ${seller.accessToken}`);

function inbound(seller: TestSeller, options: { sid?: string; aiEnabled?: boolean; body?: string } = {}) {
  return as(seller, "post", "/api/v1/conversations/mock-inbound").send({
    workspaceId: seller.workspaceId,
    From: "whatsapp:+923001234567",
    ProfileName: "Ayesha",
    Body: options.body ?? "Is the kurta available?",
    MessageSid: options.sid ?? `SM${randomUUID().replace(/-/g, "")}`,
    ...(options.aiEnabled === undefined ? {} : { aiEnabled: options.aiEnabled }),
  });
}

async function thread(seller: TestSeller, conversationId: string) {
  const messages = await as(seller, "get", `/api/v1/conversations/${conversationId}/messages`).query({
    workspaceId: seller.workspaceId,
  });
  const conversation = await as(seller, "get", `/api/v1/conversations/${conversationId}`).query({
    workspaceId: seller.workspaceId,
  });
  return { messages: [...messages.body.data].reverse() as Array<Record<string, unknown>>, conversation: conversation.body.data };
}

describe("sales agent settings API", () => {
  it("requires a token", async () => {
    expect((await request(app()).get(SETTINGS).query({ workspaceId: alice.workspaceId })).status).toBe(401);
  });

  it("returns defaults when no row exists, then saves and reads back", async () => {
    const first = await as(alice, "get", SETTINGS).query({ workspaceId: alice.workspaceId });
    expect(first.status).toBe(200);
    expect(first.body.data).toEqual({ workspaceId: alice.workspaceId, aiEnabled: false, policyText: "" });

    const put = await as(alice, "put", SETTINGS).send({
      workspaceId: alice.workspaceId,
      aiEnabled: true,
      policyText: "  Delivery 3 days. COD available.  ",
    });
    expect(put.status).toBe(200);
    expect(put.body.data).toEqual({
      workspaceId: alice.workspaceId,
      aiEnabled: true,
      policyText: "Delivery 3 days. COD available.",
    });

    // Second save updates the same row.
    const again = await as(alice, "put", SETTINGS).send({ workspaceId: alice.workspaceId, aiEnabled: false, policyText: "" });
    expect(again.body.data).toMatchObject({ aiEnabled: false, policyText: "" });
    expect((await as(alice, "get", SETTINGS).query({ workspaceId: alice.workspaceId })).body.data.aiEnabled).toBe(false);
  });

  it("validates the body", async () => {
    const tooLong = await as(alice, "put", SETTINGS).send({
      workspaceId: alice.workspaceId,
      aiEnabled: true,
      policyText: "x".repeat(4001),
    });
    expect(tooLong.status).toBe(400);
    expect((await as(alice, "put", SETTINGS).send({ workspaceId: alice.workspaceId, aiEnabled: "yes" })).status).toBe(400);
    expect((await as(alice, "put", SETTINGS).send({ workspaceId: "nope", aiEnabled: true })).status).toBe(400);
    expect((await as(alice, "get", SETTINGS)).status).toBe(400);
  });

  it("keeps tenants apart (API and RLS)", async () => {
    await as(alice, "put", SETTINGS).send({ workspaceId: alice.workspaceId, aiEnabled: true, policyText: "Alice only" });

    expect((await as(bob, "get", SETTINGS).query({ workspaceId: alice.workspaceId })).status).toBe(404);
    expect(
      (await as(bob, "put", SETTINGS).send({ workspaceId: alice.workspaceId, aiEnabled: false, policyText: "hijack" })).status,
    ).toBe(404);

    // Straight to Postgres with Bob's token: RLS shows nothing, writes are refused.
    const db = createApiSupabaseUserClient(bob.accessToken);
    const read = await db.from("sales_agent_settings").select("*").eq("workspace_id", alice.workspaceId);
    expect(read.data).toEqual([]);
    const forged = await db
      .from("sales_agent_settings")
      .insert({ workspace_id: alice.workspaceId, seller_id: alice.sellerId, ai_enabled: true });
    expect(forged.error).not.toBeNull();
    const update = await db
      .from("sales_agent_settings")
      .update({ policy_text: "hijack" })
      .eq("workspace_id", alice.workspaceId)
      .select();
    expect(update.data ?? []).toEqual([]);
    const del = await db.from("sales_agent_settings").delete().eq("workspace_id", alice.workspaceId).select();
    expect(del.data ?? []).toEqual([]);

    const anon = createSupabaseClient({ url: LOCAL_SUPABASE_URL, anonKey: LOCAL_ANON_KEY });
    expect((await anon.from("sales_agent_settings").select("*")).data ?? []).toEqual([]);

    const stored = await as(alice, "get", SETTINGS).query({ workspaceId: alice.workspaceId });
    expect(stored.body.data.policyText).toBe("Alice only");
  });
});

describe("AI reply pipeline", () => {
  it("uses the setting on ingest, answers through the simulator, and stores an ai message", async () => {
    await as(alice, "put", SETTINGS).send({ workspaceId: alice.workspaceId, aiEnabled: true, policyText: "COD available." });

    const response = await inbound(alice);
    expect(response.status).toBe(201);
    expect(response.body.data.state).toBe("ai_active");
    await whenAgentIdle();

    expect(agentCalls).toHaveLength(1);
    expect(agentCalls[0]!.auth).toBe(`Bearer ${TOKEN}`);
    expect(agentCalls[0]!.body).toMatchObject({ conversationState: "ai_active", policyText: "COD available." });
    expect(JSON.stringify(agentCalls[0]!.body)).not.toContain("923001234567");

    const { messages, conversation } = await thread(alice, response.body.data.conversationId);
    expect(messages.map((m) => [m.sender, m.status])).toEqual([
      ["buyer", "received"],
      ["ai", "sent"],
    ]);
    expect(messages[1]!.body).toBe("Yes, in stock.");
    expect(conversation.state).toBe("ai_active");
  });

  it("does not start a turn when the setting is off, for a duplicate, or in another state", async () => {
    const off = await inbound(alice);
    expect(off.body.data.state).toBe("open");

    await as(alice, "put", SETTINGS).send({ workspaceId: alice.workspaceId, aiEnabled: true, policyText: "" });
    const sid = `SM${randomUUID().replace(/-/g, "")}`;
    const first = await inbound(alice, { sid, aiEnabled: true });
    await whenAgentIdle();
    expect(agentCalls).toHaveLength(0);
    // The thread already existed as `open`, so it stayed open and never ran a turn.
    expect(first.body.data.state).toBe("open");

    const fresh = await as(alice, "post", "/api/v1/conversations/mock-inbound").send({
      workspaceId: alice.workspaceId,
      From: "whatsapp:+923009998877",
      Body: "Hi",
      MessageSid: sid + "x",
    });
    expect(fresh.body.data.state).toBe("ai_active");
    await whenAgentIdle();
    expect(agentCalls).toHaveLength(1);

    const duplicate = await as(alice, "post", "/api/v1/conversations/mock-inbound").send({
      workspaceId: alice.workspaceId,
      From: "whatsapp:+923009998877",
      Body: "Hi",
      MessageSid: sid + "x",
    });
    expect(duplicate.body.data.duplicate).toBe(true);
    await whenAgentIdle();
    expect(agentCalls).toHaveLength(1);
  });

  it("turning the AI off moves live AI conversations to open and stops new turns", async () => {
    const on = { workspaceId: alice.workspaceId, aiEnabled: true, policyText: "" };
    await as(alice, "put", SETTINGS).send(on);
    const response = await inbound(alice);
    await whenAgentIdle();
    expect(agentCalls).toHaveLength(1);

    await as(alice, "put", SETTINGS).send({ ...on, aiEnabled: false });
    const { conversation } = await thread(alice, response.body.data.conversationId);
    expect(conversation.state).toBe("open");

    await inbound(alice, { body: "Hello?" });
    await whenAgentIdle();
    expect(agentCalls).toHaveLength(1);
  });

  it("refuses mock inbound while a real provider is connected", async () => {
    const keys = ["WHATSAPP_PROVIDER", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_WORKSPACE_ID"];
    const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    Object.assign(process.env, {
      WHATSAPP_PROVIDER: "meta",
      WHATSAPP_ACCESS_TOKEN: "t",
      WHATSAPP_PHONE_NUMBER_ID: "1",
      WHATSAPP_APP_SECRET: "s",
      WHATSAPP_VERIFY_TOKEN: "v",
      WHATSAPP_WORKSPACE_ID: alice.workspaceId,
    });
    try {
      const response = await inbound(alice, { aiEnabled: true });
      expect(response.status).toBe(409);
      await whenAgentIdle();
      expect(agentCalls).toHaveLength(0);
    } finally {
      for (const k of keys) {
        if (before[k] === undefined) delete process.env[k];
        else process.env[k] = before[k];
      }
    }
  });

  it("hands off with the agent's reason, after sending its reply", async () => {
    agentAnswer.body = {
      reply: "Great, I will pass this to the seller.",
      intent: "order_interest",
      confidence: 0.9,
      handoff: { required: true, reason: "order_interest" },
      toolCalls: [],
    };
    await as(alice, "put", SETTINGS).send({ workspaceId: alice.workspaceId, aiEnabled: true, policyText: "" });
    const response = await inbound(alice, { aiEnabled: true });
    await whenAgentIdle();

    const { messages, conversation } = await thread(alice, response.body.data.conversationId);
    expect(messages.map((m) => m.sender)).toEqual(["buyer", "ai"]);
    expect(conversation).toMatchObject({ state: "human_takeover", handoffReason: "Buyer wants to order" });
  });

  it("hands off with 'AI unavailable' when the agent fails", async () => {
    agentAnswer = { status: 503, body: { detail: "down" } };
    await as(alice, "put", SETTINGS).send({ workspaceId: alice.workspaceId, aiEnabled: true, policyText: "" });
    const response = await inbound(alice, { aiEnabled: true });
    await whenAgentIdle();

    const { messages, conversation } = await thread(alice, response.body.data.conversationId);
    expect(messages.map((m) => m.sender)).toEqual(["buyer"]);
    expect(conversation).toMatchObject({ state: "human_takeover", handoffReason: "AI unavailable" });
  });

  it("orders two quick messages into two turns, the second seeing the first reply", async () => {
    await as(alice, "put", SETTINGS).send({ workspaceId: alice.workspaceId, aiEnabled: true, policyText: "" });
    const one = await inbound(alice, { aiEnabled: true, body: "First question" });
    const id = one.body.data.conversationId as string;
    // Same buyer: second message joins the same thread while turn one is queued.
    await as(alice, "post", "/api/v1/conversations/mock-inbound").send({
      workspaceId: alice.workspaceId,
      From: "whatsapp:+923001234567",
      Body: "Second question",
      MessageSid: `SM${randomUUID().replace(/-/g, "")}`,
    });
    await whenAgentIdle();

    expect(agentCalls.map((c) => (c.body.message as { body: string }).body)).toEqual(["First question", "Second question"]);
    const { messages } = await thread(alice, id);
    expect(messages.map((m) => m.sender)).toEqual(["buyer", "ai", "buyer", "ai"]);
    expect(agentCalls[1]!.body.history).toEqual([
      { role: "user", content: "First question" },
      { role: "assistant", content: "Yes, in stock." },
    ]);
  });
});
