import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../app.js";

describe("copilot routes", () => {
  it("POST /api/v1/copilot/chat returns fallback stream response without API key", async () => {
    const response = await request(createApp())
      .post("/api/v1/copilot/chat")
      .send({
        messages: [{ role: "user", text: "Hello" }],
      });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.text).toContain("PakCommerce");
    expect(response.text).toContain("Copilot");
  });
});
