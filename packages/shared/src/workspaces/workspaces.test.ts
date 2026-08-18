import { describe, expect, it } from "vitest";

import {
  createWorkspaceInputSchema,
  workspaceContractVersion,
  workspaceSchema,
} from "./index.js";

const NOW = "2026-07-12T10:00:00.000Z";
const WORKSPACE_ID = "33333333-3333-4333-8333-333333333333";
const SELLER_ID = "22222222-2222-4222-8222-222222222222";

function workspace(overrides: Record<string, unknown> = {}) {
  return {
    id: WORKSPACE_ID,
    sellerId: SELLER_ID,
    name: "Main Store",
    slug: "main-store",
    status: "active",
    isDefault: true,
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
    ...overrides,
  };
}

describe("workspace contract", () => {
  it("contract version is pinned", () => {
    expect(workspaceContractVersion).toBe("2026-07-12");
  });
});

describe("workspaceSchema archive invariant", () => {
  it("archived workspace requires archivedAt", () => {
    const result = workspaceSchema.safeParse(
      workspace({ status: "archived", archivedAt: null }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes("archivedAt"))).toBe(true);
  });

  it("archived workspace accepts archivedAt", () => {
    const result = workspaceSchema.safeParse(
      workspace({ status: "archived", archivedAt: NOW }),
    );

    expect(result.success).toBe(true);
  });

  it("active workspace rejects archivedAt", () => {
    const result = workspaceSchema.safeParse(
      workspace({ status: "active", archivedAt: NOW }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes("archivedAt"))).toBe(true);
  });

  it("active workspace accepts null archivedAt", () => {
    expect(workspaceSchema.safeParse(workspace()).success).toBe(true);
  });
});

describe("createWorkspaceInputSchema", () => {
  it("create input defaults isDefault to false", () => {
    // A new workspace must not silently become the seller's default.
    expect(createWorkspaceInputSchema.parse({ name: "Second Store" }).isDefault).toBe(false);
  });

  it("create input rejects short name", () => {
    expect(createWorkspaceInputSchema.safeParse({ name: "A" }).success).toBe(false);
  });

  it("create input trims name", () => {
    expect(createWorkspaceInputSchema.parse({ name: "  Main Store  " }).name).toBe("Main Store");
  });
});
