import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../app.js";

const APP_URL = "http://localhost:3000";

describe("health routes", () => {
  it("GET /health returns ok", async () => {
    const response = await request(createApp()).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", service: "api" });
  });

  it("GET /api/v1 returns ok", async () => {
    // Both mounts share one handler; if that changes, this catches it.
    const response = await request(createApp()).get("/api/v1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", service: "api" });
  });

  it("protected API routes reject anonymous requests", async () => {
    // The requireAuth mount sits below /health and /api/v1 health in app.ts;
    // anything reaching it without a bearer token must be a 401 envelope.
    const response = await request(createApp()).get("/api/v1/orders");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("unauthorized");
  });

  it("public mounts stay reachable without a token", async () => {
    const apiRoot = await request(createApp()).get("/api/v1");

    expect(apiRoot.status).toBe(200);
  });

  it("copilot is no longer a public mount", async () => {
    // Copilot streams through tools that read seller data and mutate inventory,
    // so it requires auth like every other protected router. The bare /copilot
    // alias must be equally protected.
    const copilot = await request(createApp()).post("/api/v1/copilot/chat");

    expect(copilot.status).toBe(401);

    const alias = await request(createApp()).post("/copilot/chat");

    expect(alias.status).toBe(401);
  });

  it("cors origin honours APP_URL", async () => {
    const response = await request(createApp({ appUrl: APP_URL }))
      .get("/health")
      .set("Origin", APP_URL);

    expect(response.headers["access-control-allow-origin"]).toBe(APP_URL);
  });
});
