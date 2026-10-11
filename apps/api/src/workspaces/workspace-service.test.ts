import { describe, expect, it, vi } from "vitest";

import { NotFoundError } from "../lib/http-errors.js";
import type { SellerContext } from "../products/seller-context.js";
import { getCurrentWorkspace, listWorkspaces } from "./workspace-service.js";

describe("workspace-service", () => {
  it("getCurrentWorkspace filters by active status and seller id", async () => {
    const mockWorkspace = {
      id: "ws-123",
      seller_id: "seller-123",
      name: "Default Store",
      slug: "default-store",
      status: "active",
      is_default: true,
      created_at: "2026-10-11T00:00:00.000Z",
      updated_at: "2026-10-11T00:00:00.000Z",
      archived_at: null,
    };

    const maybeSingleMock = vi.fn().mockResolvedValue({ data: mockWorkspace, error: null });
    const limitMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const orderCreatedMock = vi.fn().mockReturnValue({ limit: limitMock });
    const orderDefaultMock = vi.fn().mockReturnValue({ order: orderCreatedMock });
    const eqStatusMock = vi.fn().mockReturnValue({ order: orderDefaultMock });
    const eqSellerMock = vi.fn().mockReturnValue({ eq: eqStatusMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqSellerMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });

    const auth = {
      sellerId: "seller-123",
      db: { from: fromMock },
    } as unknown as SellerContext;

    const workspace = await getCurrentWorkspace(auth);

    expect(fromMock).toHaveBeenCalledWith("workspaces");
    expect(eqSellerMock).toHaveBeenCalledWith("seller_id", "seller-123");
    expect(eqStatusMock).toHaveBeenCalledWith("status", "active");
    expect(workspace.id).toBe("ws-123");
    expect(workspace.status).toBe("active");
  });

  it("getCurrentWorkspace throws NotFoundError when no active workspace is found", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const limitMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const orderCreatedMock = vi.fn().mockReturnValue({ limit: limitMock });
    const orderDefaultMock = vi.fn().mockReturnValue({ order: orderCreatedMock });
    const eqStatusMock = vi.fn().mockReturnValue({ order: orderDefaultMock });
    const eqSellerMock = vi.fn().mockReturnValue({ eq: eqStatusMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqSellerMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });

    const auth = {
      sellerId: "seller-123",
      db: { from: fromMock },
    } as unknown as SellerContext;

    await expect(getCurrentWorkspace(auth)).rejects.toThrow(NotFoundError);
  });

  it("listWorkspaces returns formatted workspace items", async () => {
    const mockRows = [
      {
        id: "ws-1",
        seller_id: "seller-123",
        name: "Store One",
        slug: "store-one",
        status: "active",
        is_default: true,
        updated_at: "2026-10-11T00:00:00.000Z",
      },
    ];

    const orderMock = vi.fn().mockResolvedValue({ data: mockRows, error: null });
    const eqMock = vi.fn().mockReturnValue({ order: orderMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });

    const auth = {
      sellerId: "seller-123",
      db: { from: fromMock },
    } as unknown as SellerContext;

    const list = await listWorkspaces(auth);

    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("ws-1");
    expect(list[0].name).toBe("Store One");
  });
});
