import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../app.js";

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
});
