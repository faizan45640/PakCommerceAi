/**
 * Tier 2 - Meta Cloud API webhook to inbox, reply and status updates.
 *
 * Real Express app and local Postgres. Only calls to graph.facebook.com are
 * stubbed; every other fetch (Supabase) goes through the real implementation.
 * Requires the local Supabase stack: `npx supabase start`.
 */

import { createHmac, randomUUID } from "node:crypto";

import request from "supertest";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import { createApiSupabaseAdminClient } from "../lib/supabase.js";
import type { TestSeller } from "../testing/api-test-env.js";
import { applyTestEnv, createTestSeller, deleteTestSeller } from "../testing/api-test-env.js";

const PHONE_ID = "10987654321";
const SECRET = "itest-secret";
const WEBHOOK = "/api/v1/webhooks/whatsapp";

let alice: TestSeller;
const realFetch = globalThis.fetch;
const graphCalls: string[] = [];

beforeAll(() => {
  applyTestEnv();
});

beforeEach(async () => {
  alice = await createTestSeller("alice");
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "tok");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", PHONE_ID);
  vi.stubEnv("WHATSAPP_APP_SECRET", SECRET);
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "v");
  vi.stubEnv("WHATSAPP_WORKSPACE_ID", alice.workspaceId);
  graphCalls.length = 0;
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://graph.facebook.com/")) {
      graphCalls.push(url);
      return Promise.resolve(new Response(JSON.stringify({ messages: [{ id: `wamid.OUT${randomUUID()}` }] })));
    }
    return realFetch(input, init);
  });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await deleteTestSeller(alice);
});

function signedPost(payload: unknown) {
  const body = JSON.stringify(payload);
  return request(createApp())
    .post(WEBHOOK)
    .set("Content-Type", "application/json")
    .set("X-Hub-Signature-256", `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`)
    .send(body);
}

function inboundPayload(wamid: string) {
  return {
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: PHONE_ID },
              contacts: [{ profile: { name: "Ayesha" }, wa_id: "923001234567" }],
              messages: [{ from: "923001234567", id: wamid, type: "text", text: { body: "Salam" } }],
            },
          },
        ],
      },
    ],
  };
}

const authed = (method: "get" | "post", path: string) =>
  request(createApp())[method](path).set("Authorization", `Bearer ${alice.accessToken}`);

async function inboxMessages() {
  const list = await authed("get", "/api/v1/conversations").query({ workspaceId: alice.workspaceId });
  return list.body.data as Array<{ id: string; state: string }>;
}

describe("whatsapp webhook to inbox", () => {
  it("creates a conversation, dedupes retries, lets the seller reply and tracks status", async () => {
    const wamid = `wamid.IN${randomUUID()}`;
    expect((await signedPost(inboundPayload(wamid))).status).toBe(200);
    await vi.waitFor(async () => expect(await inboxMessages()).toHaveLength(1));
    // Meta retry of the same message.
    expect((await signedPost(inboundPayload(wamid))).status).toBe(200);
    await new Promise((r) => setTimeout(r, 300));

    const [conversation] = await inboxMessages();
    expect(conversation!.state).toBe("open");
    const thread = await authed("get", `/api/v1/conversations/${conversation!.id}/messages`).query({
      workspaceId: alice.workspaceId,
    });
    expect(thread.body.data).toHaveLength(1);

    const reply = () =>
      authed("post", `/api/v1/conversations/${conversation!.id}/messages`).send({
        workspaceId: alice.workspaceId,
        body: "Yes, available",
      });
    expect((await reply()).status).toBe(409);

    await authed("post", `/api/v1/conversations/${conversation!.id}/state`).send({
      workspaceId: alice.workspaceId,
      to: "human_takeover",
    });
    const sent = await reply();
    expect(sent.status).toBe(201);
    expect(sent.body.data.status).toBe("sent");
    expect(graphCalls).toHaveLength(1);

    const admin = createApiSupabaseAdminClient();
    const { data: row } = await admin.from("messages").select("provider_message_id").eq("id", sent.body.data.id).single();

    const status = (value: string) =>
      signedPost({
        entry: [
          {
            changes: [
              {
                field: "messages",
                value: {
                  metadata: { phone_number_id: PHONE_ID },
                  statuses: [{ id: row!.provider_message_id, status: value }],
                },
              },
            ],
          },
        ],
      });
    const currentStatus = async () =>
      (await admin.from("messages").select("status").eq("id", sent.body.data.id).single()).data!.status;

    await status("read");
    await vi.waitFor(async () => expect(await currentStatus()).toBe("read"));
    await status("delivered");
    await new Promise((r) => setTimeout(r, 300));
    expect(await currentStatus()).toBe("read");
  });
});
