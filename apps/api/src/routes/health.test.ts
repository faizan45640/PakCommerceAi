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

  it("unknown route returns 404", async () => {
    // Guards against a catch-all that would make every future typo look healthy.
    const response = await request(createApp()).get("/api/v1/orders");

    expect(response.status).toBe(404);
  });

  it("cors origin honours APP_URL", async () => {
    const response = await request(createApp({ appUrl: APP_URL }))
      .get("/health")
      .set("Origin", APP_URL);

    expect(response.headers["access-control-allow-origin"]).toBe(APP_URL);
  });
});
