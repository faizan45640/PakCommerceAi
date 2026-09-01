/**
 * Tier 2 — the product API end to end.
 *
 * Real Express app, real JWTs issued by the local GoTrue, real Postgres with RLS
 * on. Nothing is stubbed: carrying a seller's token through to the database
 * correctly *is* the feature, so a test that mocked auth or the client would
 * prove nothing at all.
 *
 * Requires the local Supabase stack: `npx supabase start`.
 */

import { productSchema } from "@pakcommerce/shared";
import request from "supertest";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import type { TestSeller } from "../testing/api-test-env.js";
import {
  applyTestEnv,
  createTestSeller,
  deleteTestSeller,
  productPayload,
} from "../testing/api-test-env.js";

const app = () => createApp();
const PRODUCTS = "/api/v1/products";

let alice: TestSeller;

beforeAll(() => {
  applyTestEnv();
});

beforeEach(async () => {
  alice = await createTestSeller("alice");
});

afterEach(async () => {
  await deleteTestSeller(alice);
});

function asAlice(method: "post" | "get" | "patch" | "delete", path: string) {
  return request(app())[method](path).set("Authorization", `Bearer ${alice.accessToken}`);
}

describe("authentication", () => {
  it("rejects a request with no token", async () => {
    const response = await request(app()).get(PRODUCTS).query({ workspaceId: alice.workspaceId });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("unauthorized");
  });

  it("rejects a token that is not a real session", async () => {
    const response = await request(app())
      .get(PRODUCTS)
      .set("Authorization", "Bearer not-a-real-token")
      .query({ workspaceId: alice.workspaceId });

    expect(response.status).toBe(401);
  });

  it("rejects an Authorization header that is not a bearer token", async () => {
    const response = await request(app())
      .get(PRODUCTS)
      .set("Authorization", "Basic anVzdDpubw==")
      .query({ workspaceId: alice.workspaceId });

    expect(response.status).toBe(401);
  });
});

describe("POST /api/v1/products", () => {
  it("creates a product with its variants", async () => {
    const response = await asAlice("post", PRODUCTS).send(
      productPayload(alice.workspaceId, {
        variants: [
          { title: "Medium", sku: "KURTA-M", price: { amountMinor: 250000 } },
          { title: "Large", sku: "KURTA-L", price: { amountMinor: 275000 } },
        ],
      }),
    );

    expect(response.status).toBe(201);
    expect(response.body.data.variants).toHaveLength(2);
  });

  it("returns a product the shared contract accepts", async () => {
    // The contract is the agreement with every other part of the system. If the
    // API can return something it rejects, the agreement is worthless.
    const response = await asAlice("post", PRODUCTS).send(productPayload(alice.workspaceId));

    expect(productSchema.safeParse(response.body.data).success).toBe(true);
  });

  it("takes sellerId from the token and ignores the body", async () => {
    const response = await asAlice("post", PRODUCTS).send(
      productPayload(alice.workspaceId, {
        sellerId: "99999999-9999-4999-8999-999999999999",
      }),
    );

    expect(response.status).toBe(201);
    expect(response.body.data.sellerId).toBe(alice.sellerId);
  });

  it("generates a slug when none is given", async () => {
    const response = await asAlice("post", PRODUCTS).send(
      productPayload(alice.workspaceId, { title: "Lawn Kurta (Summer)" }),
    );

    expect(response.body.data.slug).toBe("lawn-kurta-summer");
  });

  it("generates the search document", async () => {
    const response = await asAlice("post", PRODUCTS).send(
      productPayload(alice.workspaceId, { tags: ["summer", "cotton"] }),
    );

    expect(response.body.data.searchText).toContain("summer");
    expect(response.body.data.searchText).toContain("kurta");
  });

  it("rejects a body the contract does not accept", async () => {
    const response = await asAlice("post", PRODUCTS).send({
      workspaceId: alice.workspaceId,
      title: "",
      variants: [],
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_error");
    // apiErrorDetailsSchema is Record<field, messages>, so the dashboard can put
    // each message on the input that caused it.
    expect(Object.keys(response.body.error.details).length).toBeGreaterThan(0);
  });

  it("refuses a product that carries images", async () => {
    const response = await asAlice("post", PRODUCTS).send(
      productPayload(alice.workspaceId, {
        images: [{ url: "https://cdn.example.com/a.jpg", altText: null }],
      }),
    );

    // Refusing beats accepting and silently dropping them. Reported as a
    // validation error because apiErrorCodeSchema has no "not implemented" code,
    // and inventing one would break the shared contract.
    expect(response.status).toBe(400);
    expect(response.body.error.details.images).toBeDefined();
  });

  it("creates nothing when one variant fails", async () => {
    // Two variants sharing a SKU passes Zod - the contract has no cross-variant
    // uniqueness rule - and fails the database's per-workspace unique index. It
    // is the cheapest way to make the second insert fail after the first.
    const response = await asAlice("post", PRODUCTS).send(
      productPayload(alice.workspaceId, {
        variants: [
          { title: "Medium", sku: "DUP-1", price: { amountMinor: 250000 } },
          { title: "Large", sku: "DUP-1", price: { amountMinor: 275000 } },
        ],
      }),
    );

    // A duplicate SKU is a collision with stored data, not a malformed request.
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("conflict");

    // The product must not survive the failed variant. Without the atomic
    // function this leaves a product with no variants, which the contract says
    // cannot exist and which would then fail to parse forever.
    const list = await asAlice("get", PRODUCTS).query({ workspaceId: alice.workspaceId });
    expect(list.body.data).toHaveLength(0);
  });
});

describe("GET /api/v1/products/:id", () => {
  it("returns the seller's own product", async () => {
    const created = await asAlice("post", PRODUCTS).send(productPayload(alice.workspaceId));
    const response = await asAlice("get", `${PRODUCTS}/${created.body.data.id}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(created.body.data.id);
  });

  it("returns 404 for a product that does not exist", async () => {
    const response = await asAlice("get", `${PRODUCTS}/11111111-1111-4111-8111-111111111111`);

    expect(response.status).toBe(404);
  });

  it("returns 404, not 403, for another seller's product", async () => {
    const bob = await createTestSeller("bob");
    try {
      const bobProduct = await request(app())
        .post(PRODUCTS)
        .set("Authorization", `Bearer ${bob.accessToken}`)
        .send(productPayload(bob.workspaceId));

      const response = await asAlice("get", `${PRODUCTS}/${bobProduct.body.data.id}`);

      // 403 would confirm the id exists, which is exactly what someone probing
      // ids wants to learn. Absent and not-yours must be indistinguishable.
      expect(response.status).toBe(404);
    } finally {
      await deleteTestSeller(bob);
    }
  });
});

describe("GET /api/v1/products", () => {
  it("lists only the seller's own products", async () => {
    const bob = await createTestSeller("bob");
    try {
      await asAlice("post", PRODUCTS).send(
        productPayload(alice.workspaceId, { title: "Alice Kurta" }),
      );
      await request(app())
        .post(PRODUCTS)
        .set("Authorization", `Bearer ${bob.accessToken}`)
        .send(productPayload(bob.workspaceId, { title: "Bob Kurta" }));

      const response = await asAlice("get", PRODUCTS).query({ workspaceId: alice.workspaceId });

      expect(response.body.data.map((item: { title: string }) => item.title)).toEqual([
        "Alice Kurta",
      ]);
    } finally {
      await deleteTestSeller(bob);
    }
  });

  it("filters by search text", async () => {
    await asAlice("post", PRODUCTS).send(productPayload(alice.workspaceId, { title: "Lawn Kurta" }));
    await asAlice("post", PRODUCTS).send(productPayload(alice.workspaceId, { title: "Silk Shawl" }));

    const response = await asAlice("get", PRODUCTS).query({
      workspaceId: alice.workspaceId,
      query: "shawl",
    });

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].title).toBe("Silk Shawl");
  });

  it("rolls variant prices up into a range", async () => {
    await asAlice("post", PRODUCTS).send(
      productPayload(alice.workspaceId, {
        variants: [
          { title: "Medium", sku: "A-M", price: { amountMinor: 200000 } },
          { title: "Large", sku: "A-L", price: { amountMinor: 300000 } },
        ],
      }),
    );

    const response = await asAlice("get", PRODUCTS).query({ workspaceId: alice.workspaceId });

    expect(response.body.data[0].priceRange.min.amountMinor).toBe(200000);
    expect(response.body.data[0].priceRange.max.amountMinor).toBe(300000);
    expect(response.body.data[0].variantCount).toBe(2);
  });

  it("paginates with an opaque cursor", async () => {
    for (const title of ["One", "Two", "Three"]) {
      await asAlice("post", PRODUCTS).send(productPayload(alice.workspaceId, { title }));
    }

    const first = await asAlice("get", PRODUCTS).query({
      workspaceId: alice.workspaceId,
      limit: 2,
    });

    expect(first.body.data).toHaveLength(2);
    expect(first.body.nextCursor).toBeTruthy();
    // apiListResponseSchema requires meta on every list response.
    expect(first.body.meta).toEqual({ page: 1, pageSize: 2, total: 3 });

    const second = await asAlice("get", PRODUCTS).query({
      workspaceId: alice.workspaceId,
      limit: 2,
      cursor: first.body.nextCursor,
    });

    expect(second.body.data).toHaveLength(1);
    expect(second.body.meta.page).toBe(2);
    expect(second.body.nextCursor).toBeNull();
  });

  it("rejects a query with no workspace", async () => {
    // Tenant scoping starts with knowing which workspace is being asked about.
    const response = await asAlice("get", PRODUCTS);

    expect(response.status).toBe(400);
  });
});

describe("PATCH /api/v1/products/:id", () => {
  it("updates a field and rebuilds the search document", async () => {
    const created = await asAlice("post", PRODUCTS).send(
      productPayload(alice.workspaceId, { tags: ["summer"] }),
    );

    const response = await asAlice("patch", `${PRODUCTS}/${created.body.data.id}`).send({
      title: "Silk Shawl",
      tags: ["winter"],
    });

    expect(response.status).toBe(200);
    expect(response.body.data.title).toBe("Silk Shawl");

    // Rebuilt, not appended to: the new words are in and the removed tag is gone.
    expect(response.body.data.searchText).toContain("shawl");
    expect(response.body.data.searchText).toContain("winter");
    expect(response.body.data.searchText).not.toContain("summer");
  });

  it("keeps the slug when the title changes", async () => {
    const created = await asAlice("post", PRODUCTS).send(productPayload(alice.workspaceId));

    const response = await asAlice("patch", `${PRODUCTS}/${created.body.data.id}`).send({
      title: "Silk Shawl",
    });

    // Deliberate: a slug is an address. Renaming a product must not silently
    // break every link and external reference to it - the seller changes the
    // slug explicitly or not at all. It is also why the old title's words can
    // still appear in searchText after a rename.
    expect(response.body.data.slug).toBe("lawn-kurta");
  });

  it("cannot update another seller's product", async () => {
    const bob = await createTestSeller("bob");
    try {
      const bobProduct = await request(app())
        .post(PRODUCTS)
        .set("Authorization", `Bearer ${bob.accessToken}`)
        .send(productPayload(bob.workspaceId));

      const response = await asAlice("patch", `${PRODUCTS}/${bobProduct.body.data.id}`).send({
        title: "Stolen",
      });

      expect(response.status).toBe(404);
    } finally {
      await deleteTestSeller(bob);
    }
  });
});

describe("DELETE /api/v1/products/:id", () => {
  it("archives the product instead of removing it", async () => {
    const created = await asAlice("post", PRODUCTS).send(productPayload(alice.workspaceId));

    const response = await asAlice("delete", `${PRODUCTS}/${created.body.data.id}`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("archived");
    expect(response.body.data.archivedAt).not.toBeNull();

    // Still retrievable: orders and inventory history will point at this row.
    const after = await asAlice("get", `${PRODUCTS}/${created.body.data.id}`);
    expect(after.status).toBe(200);
  });

  it("cannot archive another seller's product", async () => {
    const bob = await createTestSeller("bob");
    try {
      const bobProduct = await request(app())
        .post(PRODUCTS)
        .set("Authorization", `Bearer ${bob.accessToken}`)
        .send(productPayload(bob.workspaceId));

      const response = await asAlice("delete", `${PRODUCTS}/${bobProduct.body.data.id}`);

      expect(response.status).toBe(404);
    } finally {
      await deleteTestSeller(bob);
    }
  });
});
