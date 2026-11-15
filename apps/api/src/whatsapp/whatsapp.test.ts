import { createHmac } from "node:crypto";

import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { errorHandler } from "../middleware/error-handler.js";

/** Meta Cloud API webhook, adapter and seller reply. No database, no network. */

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const CONVERSATION = "22222222-2222-4222-8222-222222222222";
const PHONE_ID = "10987654321";
const SECRET = "app-secret";

// Fake clients: the user client returns `conversationResult`; the admin client records writes.
let conversationResult: { data: unknown; error: unknown } = { data: null, error: null };
const adminCalls: Array<[string, unknown[]]> = [];
const rpc = vi.fn();
let insertedRow: Record<string, unknown> | null = null;

function chain(result: unknown, record?: Array<[string, unknown[]]>) {
  const builder: Record<string, unknown> = { then: (resolve: (v: unknown) => unknown) => resolve(result) };
  for (const method of ["select", "eq", "in", "update", "maybeSingle", "single"]) {
    builder[method] = (...args: unknown[]) => {
      record?.push([method, args]);
      return builder;
    };
  }
  return builder;
}

const adminDb = {
  rpc,
  from: (table: string) => {
    adminCalls.push(["from", [table]]);
    const builder = chain({ data: null, error: null }, adminCalls) as Record<string, unknown>;
    builder.insert = (row: Record<string, unknown>) => {
      adminCalls.push(["insert", [row]]);
      insertedRow = row;
      return chain({
        data: { id: "33333333-3333-4333-8333-333333333333", created_at: "2026-11-15T10:00:00.000Z", ...row },
        error: null,
      });
    };
    return builder;
  },
};

vi.mock("../lib/supabase.js", () => ({
  createApiSupabaseUserClient: () => ({ from: () => chain(conversationResult) }),
  createApiSupabaseAdminClient: () => adminDb,
}));

const { createWhatsAppWebhookRouter, statusesThatMayMoveTo } = await import("./webhook-router.js");
const { MetaCloudProvider, getMetaCloudConfig } = await import("./meta-cloud.js");
const { conversationRouter } = await import("../conversations/conversation-router.js");

const ENV = {
  WHATSAPP_ACCESS_TOKEN: "token-123",
  WHATSAPP_PHONE_NUMBER_ID: PHONE_ID,
  WHATSAPP_APP_SECRET: SECRET,
  WHATSAPP_VERIFY_TOKEN: "verify-me",
  WHATSAPP_WORKSPACE_ID: WORKSPACE,
};

function setEnv() {
  for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
}

const fetchMock = vi.fn();

beforeEach(() => {
  setEnv();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  rpc.mockReset();
  rpc.mockResolvedValue({
    data: [{ conversation_id: CONVERSATION, message_id: "m1", duplicate: false, state: "open" }],
    error: null,
  });
  adminCalls.length = 0;
  insertedRow = null;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function webhookApp() {
  const app = express();
  app.use("/api/v1/webhooks/whatsapp", createWhatsAppWebhookRouter());
  app.use(express.json());
  return app;
}

function sign(body: string, secret = SECRET) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function change(value: Record<string, unknown>, field = "messages") {
  return { object: "whatsapp_business_account", entry: [{ id: "waba", changes: [{ field, value }] }] };
}

function textValue(overrides: Record<string, unknown> = {}) {
  return {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "1555", phone_number_id: PHONE_ID },
    contacts: [{ profile: { name: "Ayesha" }, wa_id: "923001234567" }],
    messages: [{ from: "923001234567", id: "wamid.AAA", type: "text", text: { body: "Salam" } }],
    ...overrides,
  };
}

async function post(payload: unknown, signature?: string | null) {
  const body = JSON.stringify(payload);
  const req = request(webhookApp())
    .post("/api/v1/webhooks/whatsapp")
    .set("Content-Type", "application/json");
  if (signature !== null) req.set("X-Hub-Signature-256", signature ?? sign(body));
  return req.send(body);
}

describe("webhook verification handshake", () => {
  const url = "/api/v1/webhooks/whatsapp";

  it("echoes the challenge as text for the right token", async () => {
    const res = await request(webhookApp()).get(url).query({
      "hub.mode": "subscribe",
      "hub.verify_token": "verify-me",
      "hub.challenge": "12345",
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.text).toBe("12345");
  });

  it("rejects a wrong token or mode with 403", async () => {
    const bad = await request(webhookApp()).get(url).query({
      "hub.mode": "subscribe",
      "hub.verify_token": "nope",
      "hub.challenge": "1",
    });
    expect(bad.status).toBe(403);
    const mode = await request(webhookApp()).get(url).query({
      "hub.mode": "unsubscribe",
      "hub.verify_token": "verify-me",
      "hub.challenge": "1",
    });
    expect(mode.status).toBe(403);
  });

  it("is 404 when the feature is not configured", async () => {
    vi.stubEnv("WHATSAPP_APP_SECRET", "");
    expect((await request(webhookApp()).get(url)).status).toBe(404);
    expect((await post({})).status).toBe(404);
  });
});

describe("webhook signature", () => {
  it("rejects missing and invalid signatures with 401 and ingests nothing", async () => {
    const payload = change(textValue());
    expect((await post(payload, null)).status).toBe(401);
    expect((await post(payload, sign(JSON.stringify(payload), "other-secret"))).status).toBe(401);
    expect((await post(payload, "sha256=abc")).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("accepts a valid signature over the raw bytes", async () => {
    const res = await post(change(textValue()));
    expect(res.status).toBe(200);
  });
});

describe("inbound processing", () => {
  it("ingests a text message with aiEnabled=false", async () => {
    // Real router path uses the admin client mocked above.
    await post(change(textValue()));
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    const args = rpc.mock.calls[0]![1];
    expect(args).toMatchObject({
      p_workspace_id: WORKSPACE,
      p_buyer_phone: "+923001234567",
      p_buyer_name: "Ayesha",
      p_provider_message_id: "wamid.AAA",
      p_body: "Salam",
      p_media: [],
      p_ai_enabled: false,
    });
  });

  it("ignores a different phone_number_id and non-messages fields", async () => {
    await post(change(textValue({ metadata: { phone_number_id: "999" } })));
    await post(change(textValue(), "account_update"));
    await new Promise((r) => setTimeout(r, 30));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes a duplicate wamid through to ingest, which dedupes it", async () => {
    rpc.mockResolvedValue({
      data: [{ conversation_id: CONVERSATION, message_id: "m1", duplicate: true, state: "open" }],
      error: null,
    });
    const payload = change(textValue());
    await post(payload);
    await post(payload);
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc.mock.calls[0]![1].p_provider_message_id).toBe(rpc.mock.calls[1]![1].p_provider_message_id);
  });

  it("applies status updates by provider id without downgrading", async () => {
    const value = {
      metadata: { phone_number_id: PHONE_ID },
      statuses: [{ id: "wamid.OUT", status: "delivered", recipient_id: "923001234567" }],
    };
    await post(change(value));
    await vi.waitFor(() => expect(adminCalls.some(([m]) => m === "update")).toBe(true));
    expect(adminCalls).toContainEqual(["eq", ["provider_message_id", "wamid.OUT"]]);
    expect(adminCalls).toContainEqual(["in", ["status", ["queued", "sent"]]]);
  });
});

describe("status ordering", () => {
  it("only moves forward, and failed never overwrites delivered or read", () => {
    expect(statusesThatMayMoveTo("sent")).toEqual(["queued"]);
    expect(statusesThatMayMoveTo("delivered")).toEqual(["queued", "sent"]);
    expect(statusesThatMayMoveTo("read")).toEqual(["queued", "sent", "delivered"]);
    expect(statusesThatMayMoveTo("failed")).toEqual(["queued", "sent"]);
  });
});

describe("MetaCloudProvider", () => {
  const config = getMetaCloudConfig({ ...ENV, WHATSAPP_GRAPH_VERSION: "v22.0" } as NodeJS.ProcessEnv)!;

  it("config is null unless every variable is set", () => {
    expect(getMetaCloudConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(getMetaCloudConfig({ ...ENV, WHATSAPP_VERIFY_TOKEN: " " } as NodeJS.ProcessEnv)).toBeNull();
    expect(getMetaCloudConfig(ENV as unknown as NodeJS.ProcessEnv)?.graphVersion).toBe("v23.0");
  });

  it("resolves media ids through the Graph API; caption becomes the body", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ url: "https://lookaside.fbsbx.com/x", mime_type: "image/jpeg" }), { status: 200 }),
    );
    const provider = new MetaCloudProvider(config, fetchMock);
    const parsed = await provider.parseInbound(
      change(
        textValue({
          messages: [
            { from: "923001234567", id: "wamid.IMG", type: "image", image: { id: "MEDIA1", caption: "this one" } },
          ],
        }),
      ),
    );
    expect(parsed.messages).toEqual([
      {
        providerMessageId: "wamid.IMG",
        from: "+923001234567",
        profileName: "Ayesha",
        body: "this one",
        media: [{ url: "https://lookaside.fbsbx.com/x", contentType: "image/jpeg" }],
      },
    ]);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://graph.facebook.com/v22.0/MEDIA1");
    expect(fetchMock.mock.calls[0]![1].headers.Authorization).toBe("Bearer token-123");
  });

  it("parses audio and statuses; skips unsupported types", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ url: "https://x.test/a", mime_type: "audio/ogg" }), { status: 200 }),
    );
    const provider = new MetaCloudProvider(config, fetchMock);
    const parsed = await provider.parseInbound(
      change(
        textValue({
          messages: [
            { from: "923001234567", id: "wamid.A", type: "audio", audio: { id: "M2" } },
            { from: "923001234567", id: "wamid.L", type: "location", location: {} },
          ],
          statuses: [
            { id: "wamid.S", status: "read" },
            { id: "wamid.T", status: "weird" },
          ],
        }),
      ),
    );
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0]).toMatchObject({ body: null, media: [{ contentType: "audio/ogg" }] });
    expect(parsed.statuses).toEqual([{ providerMessageId: "wamid.S", status: "read" }]);
  });

  it("sendText posts to the messages endpoint and returns the wamid", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.NEW" }] }), { status: 200 }));
    const id = await new MetaCloudProvider(config, fetchMock).sendText("+923001234567", "hi");
    expect(id).toBe("wamid.NEW");
    expect(fetchMock.mock.calls[0]![0]).toBe(`https://graph.facebook.com/v22.0/${PHONE_ID}/messages`);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({ to: "923001234567", text: { body: "hi" } });
  });
});

describe("POST /conversations/:id/messages", () => {
  function replyApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.auth = { userId: "seller-1", accessToken: "t" } as typeof req.auth;
      next();
    });
    app.use("/api/v1/conversations", conversationRouter);
    app.use(errorHandler);
    return app;
  }

  const send = (body: unknown = { workspaceId: WORKSPACE, body: "Hello" }) =>
    request(replyApp()).post(`/api/v1/conversations/${CONVERSATION}/messages`).send(body as object);

  function conversation(state: string) {
    return {
      id: CONVERSATION,
      workspace_id: WORKSPACE,
      seller_id: "seller-1",
      channel: "whatsapp",
      buyer_phone: "+923001234567",
      buyer_name: "Ayesha",
      customer_id: null,
      state,
      handoff_reason: null,
      unread_count: 0,
      last_message_at: null,
      last_message_preview: null,
      last_message_sender: null,
      state_changed_at: "2026-11-15T09:00:00.000Z",
      created_at: "2026-11-15T09:00:00.000Z",
      updated_at: "2026-11-15T09:00:00.000Z",
    };
  }

  it("is 409 unless the conversation is in human_takeover, and sends nothing", async () => {
    conversationResult = { data: conversation("ai_active"), error: null };
    const res = await send();
    expect(res.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is 404 for a conversation the seller cannot see (cross-tenant)", async () => {
    conversationResult = { data: null, error: null };
    const res = await send();
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates the body", async () => {
    expect((await send({ workspaceId: WORKSPACE, body: "   " })).status).toBe(400);
    expect((await send({ workspaceId: WORKSPACE, body: "x".repeat(4097) })).status).toBe(400);
  });

  it("sends, records the provider id, and returns the message as sent", async () => {
    conversationResult = { data: conversation("human_takeover"), error: null };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.OUT" }] }), { status: 200 }));
    const res = await send();
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ direction: "outbound", sender: "seller", status: "sent", body: "Hello" });
    expect(insertedRow).toMatchObject({ provider_message_id: "wamid.OUT", seller_id: "seller-1" });
  });

  it("records a failed message and returns 502 on provider failure", async () => {
    conversationResult = { data: conversation("human_takeover"), error: null };
    fetchMock.mockResolvedValue(new Response("{}", { status: 400 }));
    const res = await send();
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain("token-123");
    expect(insertedRow).toMatchObject({ status: "failed", provider_message_id: null });
  });

  it("is 404 when WhatsApp is not configured", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    conversationResult = { data: conversation("human_takeover"), error: null };
    expect((await send()).status).toBe(404);
  });
});
