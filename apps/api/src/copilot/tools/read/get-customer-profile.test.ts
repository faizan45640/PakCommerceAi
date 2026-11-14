import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SellerContext } from "../../../middleware/seller-context.js";

const getCustomerContextMock = vi.fn();
const getCurrentWorkspaceMock = vi.fn();

vi.mock("../../../customers/customer-service.js", () => ({
  getCustomerContext: (...args: unknown[]) => getCustomerContextMock(...args),
}));
vi.mock("../../../workspaces/workspace-service.js", () => ({
  getCurrentWorkspace: (...args: unknown[]) => getCurrentWorkspaceMock(...args),
}));

const { getCustomerProfileTool, getCustomerProfileInputSchema } = await import(
  "./get-customer-profile.js"
);

const auth = { sellerId: "seller-1", db: {} } as unknown as SellerContext;

const WORKSPACE_ID = "323e4567-e89b-42d3-a456-426614174000";
const CUSTOMER_ID = "123e4567-e89b-42d3-a456-426614174000";

const FOUND = {
  found: true,
  customer: { id: CUSTOMER_ID, name: "Ali", phone: "+923001234567", city: "Lahore" },
  tags: ["first_time"],
  summary: {
    lifetimeSpend: { amountMinor: 0, currency: "PKR" },
    completedOrderCount: 0,
    totalOrderCount: 1,
    returnedOrderCount: 0,
    lastOrderAt: "2026-11-14T10:00:00+00:00",
  },
  recentOrders: [],
  riskNotes: [],
};

beforeEach(() => {
  getCustomerContextMock.mockReset();
  getCurrentWorkspaceMock.mockReset();
  getCurrentWorkspaceMock.mockResolvedValue({ id: WORKSPACE_ID });
});

describe("getCustomerProfileInputSchema", () => {
  it("accepts exactly one of customerId or phone", () => {
    expect(getCustomerProfileInputSchema.safeParse({ phone: "0300-1234567" }).success).toBe(true);
    expect(getCustomerProfileInputSchema.safeParse({ customerId: CUSTOMER_ID }).success).toBe(true);
  });

  it("rejects neither, both, or a bad id", () => {
    expect(getCustomerProfileInputSchema.safeParse({}).success).toBe(false);
    expect(
      getCustomerProfileInputSchema.safeParse({ customerId: CUSTOMER_ID, phone: "0300" }).success,
    ).toBe(false);
    expect(getCustomerProfileInputSchema.safeParse({ customerId: "nope" }).success).toBe(false);
  });
});

describe("getCustomerProfileTool", () => {
  it("looks up by phone in the seller's current workspace, in any format", async () => {
    getCustomerContextMock.mockResolvedValueOnce(FOUND);

    const result = await getCustomerProfileTool(auth).execute({ phone: "0300 1234567" });

    expect(result).toEqual(FOUND);
    expect(getCustomerContextMock).toHaveBeenCalledWith(auth, WORKSPACE_ID, {
      phone: "0300 1234567",
    });
  });

  it("looks up by id and ignores a model-supplied workspaceId", async () => {
    getCustomerContextMock.mockResolvedValueOnce(FOUND);

    await getCustomerProfileTool(auth).execute({
      customerId: CUSTOMER_ID,
      ...({ workspaceId: "99999999-9999-4999-8999-999999999999" } as Record<string, string>),
    });

    expect(getCustomerContextMock).toHaveBeenCalledWith(auth, WORKSPACE_ID, {
      customerId: CUSTOMER_ID,
    });
  });

  it("answers found: false with a message for an unknown customer", async () => {
    getCustomerContextMock.mockResolvedValueOnce({ found: false });

    const result = await getCustomerProfileTool(auth).execute({ phone: "03009999999" });

    expect(result.found).toBe(false);
    expect(result).toHaveProperty("message");
  });

  it("does not call the service when the input is invalid", async () => {
    const result = await getCustomerProfileTool(auth).execute({});

    expect(result.found).toBe(false);
    expect(getCustomerContextMock).not.toHaveBeenCalled();
  });

  it("turns a service error (such as a no-digit phone) into found: false", async () => {
    getCustomerContextMock.mockRejectedValueOnce(new Error("Invalid customer query."));

    const result = await getCustomerProfileTool(auth).execute({ phone: "n/a" });

    expect(result).toEqual({ found: false, message: "Invalid customer query." });
  });
});
