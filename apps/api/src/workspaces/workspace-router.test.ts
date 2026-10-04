import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../app.js";

describe("workspace routes", () => {
  it("GET /api/v1/workspaces/current rejects an unauthenticated request", async () => {
    const response = await request(createApp()).get("/api/v1/workspaces/current");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("unauthorized");
  });

  it("GET /api/v1/workspaces rejects an unauthenticated request", async () => {
    const response = await request(createApp()).get("/api/v1/workspaces");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("unauthorized");
  });
});
