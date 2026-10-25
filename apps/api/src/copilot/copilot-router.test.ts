import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import { copilotRouter } from "./copilot-router.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("copilot routes", () => {
  it("POST /api/v1/copilot/chat rejects a request with no token", async () => {
    const response = await request(createApp())
      .post("/api/v1/copilot/chat")
      .send({
        messages: [{ role: "user", text: "Hello" }],
      });

    // The endpoint exposes tools that will read seller data and mutate
    // inventory, so it must not be reachable by an unauthenticated caller.
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("unauthorized");
  });

  it("POST /api/v1/copilot/chat rejects a garbage token", async () => {
    const response = await request(createApp())
      .post("/api/v1/copilot/chat")
      .set("Authorization", "Bearer not-a-real-token")
      .send({
        messages: [{ role: "user", text: "Hello" }],
      });

    expect(response.status).toBe(401);
  });

  it("the bare /copilot mount is protected too", async () => {
    const response = await request(createApp()).post("/copilot/chat").send({
      messages: [{ role: "user", text: "Hello" }],
    });

    expect(response.status).toBe(401);
  });

  it("chat list and chat creation reject a request with no token", async () => {
    const app = createApp();

    const list = await request(app).get("/api/v1/copilot/chats");
    const created = await request(app).post("/api/v1/copilot/chats");

    expect(list.status).toBe(401);
    expect(created.status).toBe(401);
  });

  it("chat archive and delete reject a request with no token", async () => {
    const app = createApp();
    const id = "11111111-1111-4111-8111-111111111111";

    const archived = await request(app).post(`/api/v1/copilot/chats/${id}/archive`);
    const restored = await request(app).post(`/api/v1/copilot/chats/${id}/unarchive`);
    const deleted = await request(app).delete(`/api/v1/copilot/chats/${id}`);

    expect(archived.status).toBe(401);
    expect(restored.status).toBe(401);
    expect(deleted.status).toBe(401);
  });

  it("streams the setup message in the UI message format when no provider is configured", async () => {
    vi.stubEnv("AI_PROVIDER", "google");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");

    const app = express();
    app.use(express.json());
    app.use("/api/v1/copilot", copilotRouter);

    const response = await request(app)
      .post("/api/v1/copilot/chat")
      .send({
        id: "11111111-1111-4111-8111-111111111111",
        message: { id: "m1", role: "user", parts: [{ type: "text", text: "Hello" }] },
      });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.headers["x-vercel-ai-ui-message-stream"]).toBe("v1");
    expect(response.text).toContain('"type":"text-start"');
    expect(response.text).toContain('"type":"text-delta"');
    expect(response.text).toContain('"delta":"**Rafiq"');
  });
});
