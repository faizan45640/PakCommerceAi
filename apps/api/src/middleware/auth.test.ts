import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { requireAuth } from "./auth.js";

function buildApp(verifier: Parameters<typeof requireAuth>[number]) {
  const app = express();

  app.get("/protected", requireAuth(verifier), (_req, res) => {
    res.json({ userId: _req.auth?.userId });
  });

  return app;
}

const okVerifier = vi.fn(async (token: string) => {
  if (token === "good-token") {
    return { id: "user-1", email: "seller@example.com" };
  }
  throw new Error("invalid");
});

describe("requireAuth", () => {
  it("rejects requests without an authorization header", async () => {
    const res = await request(buildApp(okVerifier)).get("/protected");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
    expect(res.body.error.message).toMatch(/Missing bearer token/);
  });

  it("rejects malformed authorization headers", async () => {
    const res = await request(buildApp(okVerifier))
      .get("/protected")
      .set("Authorization", "Token abc123");

    expect(res.status).toBe(401);
  });

  it("rejects tokens the verifier rejects", async () => {
    const res = await request(buildApp(okVerifier))
      .get("/protected")
      .set("Authorization", "Bearer bad-token");

    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/Invalid or expired/);
  });

  it("attaches the auth context and passes the request through", async () => {
    const res = await request(buildApp(okVerifier))
      .get("/protected")
      .set("Authorization", "Bearer good-token");

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe("user-1");
    expect(okVerifier).toHaveBeenCalledWith("good-token");
  });

  it("is case-insensitive about the bearer scheme", async () => {
    const res = await request(buildApp(okVerifier))
      .get("/protected")
      .set("Authorization", "bearer good-token");

    expect(res.status).toBe(200);
  });
});
