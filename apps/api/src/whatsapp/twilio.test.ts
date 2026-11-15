import { createHmac } from "node:crypto";

import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { errorHandler } from "../middleware/error-handler.js";

/** Twilio adapter, webhook, provider switch and reply path. No database, no network. */

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const CONVERSATION = "22222222-2222-4222-8222-222222222222";
const TOKEN = "twilio-auth-token";
const PUBLIC_URL = "https://hook.example.com/api/v1/webhooks/twilio";

const rpc = vi.fn();
const updates: Array<{ patch: unknown; filters: unknown[][] }> = [];
let conversationResult: { data: unknown; error: unknown } = { data: null, error: null };
let insertedRow: Record<string, unknown> | null = null;

function chain(result: unknown, record?: { patch: unknown; filters: unknown[][] }) {
  const builder: Record<string, unknown> = { then: (resolve: (v: unknown) => unknown) => resolve(result) };
  for (const method of ["select", "eq", "in", "maybeSingle", "single"]) {
    builder[method] = (...args: unknown[]) => {
      record?.filters.push([method, ...args]);
      return builder;
    };
  }
  return builder;
}

const adminDb = {
  rpc,
  from: () => {
    const builder = chain({ data: null, error: null }) as Record<string, unknown>;
    builder.update = (patch: unknown) => {
      const record = { patch, filters: [] as unknown[][] };
      updates.push(record);
      return chain({ data: null, error: null }, record);
    };
    builder.insert = (row: Record<string, unknown>) => {
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

const { createTwilioWebhookRouter } = await import("./twilio-router.js");
const { createWhatsAppWebhookRouter, statusesThatMayMoveTo } = await import("./webhook-router.js");
const { TwilioProvider, computeTwilioSignature, getTwilioConfig, parseFormBody } = await import("./twilio.js");
const { getActiveWhatsApp } = await import("./factory.js");
const { conversationRouter } = await import("../conversations/conversation-router.js");

const TWILIO_ENV = {
  WHATSAPP_PROVIDER: "twilio",
  TWILIO_ACCOUNT_SID: "ACtest",
  TWILIO_AUTH_TOKEN: TOKEN,
  TWILIO_WHATSAPP_FROM: "whatsapp:+14155238886",
  TWILIO_WEBHOOK_PUBLIC_URL: PUBLIC_URL,
  WHATSAPP_WORKSPACE_ID: WORKSPACE,
};
const META_ENV = {
  WHATSAPP_ACCESS_TOKEN: "meta-token",
  WHATSAPP_PHONE_NUMBER_ID: "123",
  WHATSAPP_APP_SECRET: "secret",
  WHATSAPP_VERIFY_TOKEN: "verify",
  WHATSAPP_WORKSPACE_ID: WORKSPACE,
};

function useEnv(env: Record<string, string>) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
}

const fetchMock = vi.fn();

beforeEach(() => {
  useEnv(TWILIO_ENV);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  rpc.mockReset();
  rpc.mockResolvedValue({
    data: [{ conversation_id: CONVERSATION, message_id: "m1", duplicate: false, state: "open" }],
    error: null,
  });
  updates.length = 0;
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
  app.use("/api/v1/webhooks/twilio", createTwilioWebhookRouter());
  app.use("/api/v1/webhooks/whatsapp", createWhatsAppWebhookRouter());
  app.use(express.json());
  return app;
}

type Pairs = Array<[string, string]>;

/** Independent re-implementation of the documented algorithm, so tests do not just echo the code. */
function sign(url: string, pairs: Pairs, token = TOKEN) {
  const sorted = [...pairs].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1));
  const data = url + sorted.map(([k, v]) => k + v).join("");
  return createHmac("sha1", token).update(data).digest("base64");
}

const form = (pairs: Pairs) => new URLSearchParams(pairs).toString();

const TEXT: Pairs = [
  ["MessageSid", "SMaaa"],
  ["From", "whatsapp:+923001234567"],
  ["To", "whatsapp:+14155238886"],
  ["ProfileName", "Ayesha"],
  ["Body", "Salam"],
  ["NumMedia", "0"],
];

function post(pairs: Pairs, signature?: string | null) {
  const req = request(webhookApp())
    .post("/api/v1/webhooks/twilio")
    .set("Content-Type", "application/x-www-form-urlencoded");
  if (signature !== null) req.set("X-Twilio-Signature", signature ?? sign(PUBLIC_URL, pairs));
  return req.send(form(pairs));
}

describe("signature", () => {
  const provider = () => new TwilioProvider(getTwilioConfig()!);

  it("accepts a correct signature and rejects wrong, missing, tampered or other-URL ones", () => {
    const body = Buffer.from(form(TEXT));
    expect(provider().verifyRequest(body, { "x-twilio-signature": sign(PUBLIC_URL, TEXT) })).toBe(true);
    expect(provider().verifyRequest(body, {})).toBe(false);
    expect(provider().verifyRequest(body, { "x-twilio-signature": "abc" })).toBe(false);
    expect(provider().verifyRequest(body, { "x-twilio-signature": sign(PUBLIC_URL, TEXT, "other") })).toBe(false);
    expect(provider().verifyRequest(body, { "x-twilio-signature": sign("http://localhost:4000/x", TEXT) })).toBe(false);
    const tampered: Pairs = TEXT.map(([k, v]) => [k, k === "Body" ? "hacked" : v]);
    expect(
      provider().verifyRequest(Buffer.from(form(tampered)), { "x-twilio-signature": sign(PUBLIC_URL, TEXT) }),
    ).toBe(false);
  });

  it("sorts params by key and repeated keys by value", () => {
    const pairs: Pairs = [
      ["Zeta", "1"],
      ["Alpha", "b"],
      ["Alpha", "a"],
      ["Mid", "x y"],
    ];
    const params = parseFormBody(Buffer.from(form(pairs)));
    expect(params.Alpha).toEqual(["b", "a"]);
    expect(computeTwilioSignature(TOKEN, PUBLIC_URL, params)).toBe(sign(PUBLIC_URL, pairs));
    const shuffled = parseFormBody(Buffer.from(form([...pairs].reverse())));
    expect(computeTwilioSignature(TOKEN, PUBLIC_URL, shuffled)).toBe(sign(PUBLIC_URL, pairs));
  });
});

describe("parseInbound", () => {
  const provider = () => new TwilioProvider(getTwilioConfig()!);
  const parse = (pairs: Pairs) => provider().parseInbound(parseFormBody(Buffer.from(form(pairs))));

  it("normalizes a text message", async () => {
    expect(await parse(TEXT)).toEqual({
      messages: [{ providerMessageId: "SMaaa", from: "+923001234567", profileName: "Ayesha", body: "Salam", media: [] }],
      statuses: [],
    });
  });

  it("keeps media URL and type only, capped at 10, without credentials", async () => {
    const media: Pairs = [["NumMedia", "12"]];
    for (let i = 0; i < 12; i += 1) {
      media.push([`MediaUrl${i}`, `https://api.twilio.com/m/${i}`], [`MediaContentType${i}`, "image/jpeg"]);
    }
    const base: Pairs = [
      ["MessageSid", "SMmedia"],
      ["From", "whatsapp:+923001234567"],
      ["Body", ""],
    ];
    const message = (await parse([...base, ...media])).messages[0]!;
    expect(message.media).toHaveLength(10);
    expect(message.media[0]).toEqual({ url: "https://api.twilio.com/m/0", contentType: "image/jpeg" });
    expect(message.body).toBeNull();
    expect(JSON.stringify(message)).not.toContain(TOKEN);
  });

  it("ignores non-WhatsApp senders and malformed payloads", async () => {
    const sms: Pairs = TEXT.map(([k, v]) => [k, k === "From" ? "+923001234567" : v]);
    expect((await parse(sms)).messages).toEqual([]);
    expect(await provider().parseInbound(null)).toEqual({ messages: [], statuses: [] });
    expect(await parse([["Body", "x"]])).toEqual({ messages: [], statuses: [] });
  });

  it.each([
    ["sent", "sent"],
    ["delivered", "delivered"],
    ["read", "read"],
    ["failed", "failed"],
    ["undelivered", "failed"],
  ])("maps status %s to %s", async (twilio, ours) => {
    const out = await parse([
      ["MessageSid", "SMout"],
      ["MessageStatus", twilio],
      ["From", "whatsapp:+14155238886"],
    ]);
    expect(out).toEqual({ messages: [], statuses: [{ providerMessageId: "SMout", status: ours }] });
  });

  it.each(["queued", "accepted", "sending", "scheduled"])("ignores in-flight status %s", async (twilio) => {
    expect(
      await parse([
        ["MessageSid", "SMout"],
        ["MessageStatus", twilio],
      ]),
    ).toEqual({ messages: [], statuses: [] });
  });

  it("uses the shared no-downgrade rule", () => {
    expect(statusesThatMayMoveTo("failed")).toEqual(["queued", "sent"]);
    expect(statusesThatMayMoveTo("delivered")).toEqual(["queued", "sent"]);
  });
});

describe("POST /api/v1/webhooks/twilio", () => {
  it("ingests and answers 200 with empty TwiML", async () => {
    const res = await post(TEXT);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/xml/);
    expect(res.text).toBe("<Response/>");
    expect(rpc.mock.calls[0]![1]).toMatchObject({
      p_workspace_id: WORKSPACE,
      p_buyer_phone: "+923001234567",
      p_provider_message_id: "SMaaa",
      p_body: "Salam",
      p_ai_enabled: false,
    });
  });

  it("rejects bad or missing signatures with 401 and ingests nothing", async () => {
    expect((await post(TEXT, null)).status).toBe(401);
    expect((await post(TEXT, "nope")).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("applies status callbacks without downgrading", async () => {
    const res = await post([
      ["MessageSid", "SMout"],
      ["MessageStatus", "delivered"],
    ]);
    expect(res.status).toBe(200);
    expect(updates[0]!.patch).toEqual({ status: "delivered" });
    expect(updates[0]!.filters).toContainEqual(["in", "status", ["queued", "sent"]]);
  });

  it("answers 500 on a transient database failure so Twilio retries", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "db down" } });
    expect((await post(TEXT)).status).toBe(500);
  });
});

describe("provider switch", () => {
  it("serves Twilio only when selected and configured; Meta route is then 404", async () => {
    useEnv(META_ENV);
    expect((await post(TEXT)).status).toBe(200);
    expect((await request(webhookApp()).post("/api/v1/webhooks/whatsapp").send({})).status).toBe(404);

    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    expect((await post(TEXT)).status).toBe(404);
  });

  it("defaults to Meta: Twilio route 404, Meta route live", async () => {
    vi.stubEnv("WHATSAPP_PROVIDER", "");
    useEnv(META_ENV);
    expect((await post(TEXT)).status).toBe(404);
    expect((await request(webhookApp()).post("/api/v1/webhooks/whatsapp").send({})).status).toBe(401);
    expect(getActiveWhatsApp()?.name).toBe("meta");
  });

  it("factory returns the adapter for the selected provider", () => {
    expect(getActiveWhatsApp()?.name).toBe("twilio");
    vi.stubEnv("TWILIO_WHATSAPP_FROM", "");
    expect(getActiveWhatsApp()).toBeNull();
  });
});

describe("TwilioProvider.sendText", () => {
  const provider = () => new TwilioProvider(getTwilioConfig()!, fetchMock);
  const failure = (status: number, code?: number) =>
    new Response(JSON.stringify(code ? { code, message: "secret detail" } : {}), { status });

  it("posts a form with basic auth and returns the sid", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ sid: "SMnew" }), { status: 201 }));
    expect(await provider().sendText("+923001234567", "Hello")).toBe("SMnew");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from(`ACtest:${TOKEN}`).toString("base64")}`);
    expect(Object.fromEntries(new URLSearchParams(init.body as URLSearchParams))).toEqual({
      From: "whatsapp:+14155238886",
      To: "whatsapp:+923001234567",
      Body: "Hello",
      StatusCallback: PUBLIC_URL,
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    [400, 63016, "reengagement"],
    [400, 21608, "recipient"],
    [401, 20003, "token"],
    [500, undefined, "other"],
  ])("maps %s/%s to %s", async (status, code, reason) => {
    fetchMock.mockResolvedValue(failure(status, code));
    await expect(provider().sendText("+923001234567", "x")).rejects.toMatchObject({ reason, status });
  });

  it("wraps network errors", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));
    await expect(provider().sendText("+923001234567", "x")).rejects.toMatchObject({ reason: "other" });
  });
});

describe("seller reply via Twilio", () => {
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
  const send = () =>
    request(replyApp())
      .post(`/api/v1/conversations/${CONVERSATION}/messages`)
      .send({ workspaceId: WORKSPACE, body: "Hello" });
  const conversation = {
    id: CONVERSATION,
    workspace_id: WORKSPACE,
    seller_id: "seller-1",
    channel: "whatsapp",
    buyer_phone: "+923001234567",
    buyer_name: "Ayesha",
    customer_id: null,
    state: "human_takeover",
    handoff_reason: null,
    unread_count: 0,
    last_message_at: null,
    last_message_preview: null,
    last_message_sender: null,
    state_changed_at: "2026-11-15T09:00:00.000Z",
    created_at: "2026-11-15T09:00:00.000Z",
    updated_at: "2026-11-15T09:00:00.000Z",
  };

  it("sends through Twilio and records the sid", async () => {
    conversationResult = { data: conversation, error: null };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ sid: "SMout" }), { status: 201 }));
    const res = await send();
    expect(res.status).toBe(201);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("api.twilio.com");
    expect(insertedRow).toMatchObject({ provider_message_id: "SMout", status: "sent" });
  });

  it("maps 63016 to a 422 about the 24 hour window", async () => {
    conversationResult = { data: conversation, error: null };
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: 63016, message: "secret detail" }), { status: 400 }),
    );
    const res = await send();
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/24 hours/);
    expect(JSON.stringify(res.body)).not.toContain("secret detail");
  });
});
