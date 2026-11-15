import { describe, expect, it, vi } from "vitest";

import { getWhatsAppProviderName } from "./config.js";
import { getActiveWhatsApp } from "./factory.js";
import { SimulatorProvider } from "./simulator.js";
import { createTwilioWebhookRouter } from "./twilio-router.js";
import { createWhatsAppWebhookRouter } from "./webhook-router.js";
import express from "express";
import request from "supertest";

describe("simulator provider", () => {
  it("returns a fake id without touching the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const provider = new SimulatorProvider();
    const id = await provider.sendText("+923001234567", "hello");

    expect(id).toMatch(/^sim-[0-9a-f-]{36}$/);
    expect(await provider.sendText("+923001234567", "again")).not.toBe(id);
    expect(provider.sent.map((s) => s.body)).toEqual(["hello", "again"]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("has no webhook: nothing verifies and nothing parses", async () => {
    const provider = new SimulatorProvider();
    expect(provider.verifyRequest()).toBe(false);
    expect(await provider.parseInbound()).toEqual({ messages: [], statuses: [] });
  });

  it("is selected by WHATSAPP_PROVIDER=simulator, with or without a workspace", () => {
    expect(getWhatsAppProviderName({ WHATSAPP_PROVIDER: "Simulator" })).toBe("simulator");
    expect(getActiveWhatsApp({ WHATSAPP_PROVIDER: "simulator" })).toMatchObject({
      name: "simulator",
      workspaceId: null,
    });
    expect(
      getActiveWhatsApp({ WHATSAPP_PROVIDER: "simulator", WHATSAPP_WORKSPACE_ID: "ws" })?.workspaceId,
    ).toBe("ws");
  });

  it("makes the Meta and Twilio webhooks answer 404", async () => {
    const previous = process.env.WHATSAPP_PROVIDER;
    process.env.WHATSAPP_PROVIDER = "simulator";
    try {
      const app = express();
      app.use("/meta", createWhatsAppWebhookRouter());
      app.use("/twilio", createTwilioWebhookRouter());

      expect((await request(app).get("/meta")).status).toBe(404);
      expect((await request(app).post("/meta").send({})).status).toBe(404);
      expect((await request(app).post("/twilio").type("form").send("Body=hi")).status).toBe(404);
    } finally {
      if (previous === undefined) delete process.env.WHATSAPP_PROVIDER;
      else process.env.WHATSAPP_PROVIDER = previous;
    }
  });
});
