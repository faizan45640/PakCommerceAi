import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError, ValidationError } from "../../../lib/http-errors.js";
import type { SellerContext } from "../../../middleware/seller-context.js";

const createDraftOrderMock = vi.fn();
const getCurrentWorkspaceMock = vi.fn();

vi.mock("../../../orders/order-service.js", () => ({
  createDraftOrder: (...args: unknown[]) => createDraftOrderMock(...args),
}));
vi.mock("../../../workspaces/workspace-service.js", () => ({
  getCurrentWorkspace: (...args: unknown[]) => getCurrentWorkspaceMock(...args),
}));

const { createDraftOrderTool, createDraftOrderToolInputSchema } = await import(
  "./create-draft-order.js"
);

const auth = { sellerId: "seller-1", db: {} } as unknown as SellerContext;

const VARIANT_ID = "123e4567-e89b-42d3-a456-426614174000";
const PRODUCT_ID = "223e4567-e89b-42d3-a456-426614174000";
const WORKSPACE_ID = "323e4567-e89b-42d3-a456-426614174000";

const validInput = {
  customer: { name: "Ali", phone: "03001234567", city: "Lahore" },
  items: [{ variantId: VARIANT_ID, productId: PRODUCT_ID, quantity: 2 }],
};

beforeEach(() => {
  createDraftOrderMock.mockReset();
  getCurrentWorkspaceMock.mockReset();
  getCurrentWorkspaceMock.mockResolvedValue({ id: WORKSPACE_ID });
});

describe("createDraftOrderToolInputSchema", () => {
  it("accepts a minimal order", () => {
    expect(createDraftOrderToolInputSchema.safeParse(validInput).success).toBe(true);
  });

  it("rejects missing customer fields, empty items and bad quantities", () => {
    expect(
      createDraftOrderToolInputSchema.safeParse({ ...validInput, items: [] }).success,
    ).toBe(false);
    expect(
      createDraftOrderToolInputSchema.safeParse({
        ...validInput,
        customer: { name: "Ali", phone: "03001234567" },
      }).success,
    ).toBe(false);
    expect(
      createDraftOrderToolInputSchema.safeParse({
        ...validInput,
        items: [{ variantId: VARIANT_ID, productId: PRODUCT_ID, quantity: 0 }],
      }).success,
    ).toBe(false);
  });

  it("rejects a channel outside the shared enum", () => {
    expect(
      createDraftOrderToolInputSchema.safeParse({ ...validInput, channel: "telegram" }).success,
    ).toBe(false);
  });

  it("strips status, workspaceId, unit price, title, sku and totals", () => {
    const parsed = createDraftOrderToolInputSchema.parse({
      ...validInput,
      status: "confirmed",
      workspaceId: "someone-elses",
      total: 1,
      items: [
        {
          variantId: VARIANT_ID,
          productId: PRODUCT_ID,
          quantity: 2,
          unitPrice: { amountMinor: 1, currency: "PKR" },
          title: "Free thing",
          sku: "X",
        },
      ],
    });

    expect(parsed).not.toHaveProperty("status");
    expect(parsed).not.toHaveProperty("workspaceId");
    expect(parsed).not.toHaveProperty("total");
    expect(parsed.items[0]).toEqual({ variantId: VARIANT_ID, productId: PRODUCT_ID, quantity: 2 });
  });
});

describe("createDraftOrderTool", () => {
  it("requires approval", () => {
    expect(createDraftOrderTool(auth).needsApproval).toBe(true);
  });

  it("creates the draft in the seller's current workspace and maps the result", async () => {
    createDraftOrderMock.mockResolvedValue({
      id: "order-1",
      status: "draft",
      customer: { name: "Ali", city: "Lahore" },
      total: { amountMinor: 450000, currency: "PKR" },
      items: [{ quantity: 2 }, { quantity: 1 }],
    });

    const result = await createDraftOrderTool(auth).execute({
      ...validInput,
      shippingFee: 20000,
    });

    expect(getCurrentWorkspaceMock).toHaveBeenCalledWith(auth);
    expect(createDraftOrderMock).toHaveBeenCalledTimes(1);
    const [calledAuth, serviceInput] = createDraftOrderMock.mock.calls[0]!;
    expect(calledAuth).toBe(auth);
    expect(serviceInput).toMatchObject({
      workspaceId: WORKSPACE_ID,
      channel: "manual",
      paymentMethod: "cod",
      shippingFee: { amountMinor: 20000, currency: "PKR" },
      customer: { name: "Ali", phone: "03001234567", city: "Lahore" },
      items: [{ variantId: VARIANT_ID, productId: PRODUCT_ID, quantity: 2 }],
    });
    expect(serviceInput).not.toHaveProperty("status");
    expect(serviceInput.items[0]).not.toHaveProperty("unitPrice");

    expect(result).toEqual({
      status: "success",
      orderId: "order-1",
      orderStatus: "draft",
      total: 450000,
      itemCount: 3,
      message:
        "Draft order for Ali (Lahore) created — Rs 4,500. Confirm it from the Orders page.",
    });
  });

  it("does not let extra fields reach the service even when execute is called directly", async () => {
    createDraftOrderMock.mockResolvedValue({
      id: "o",
      customer: { name: "Ali", city: "Lahore" },
      total: { amountMinor: 100 },
      items: [{ quantity: 1 }],
    });

    await createDraftOrderTool(auth).execute({
      ...validInput,
      status: "confirmed",
      workspaceId: "other",
      items: [
        {
          variantId: VARIANT_ID,
          productId: PRODUCT_ID,
          quantity: 1,
          unitPrice: { amountMinor: 1, currency: "PKR" },
        },
      ],
    } as never);

    const [, serviceInput] = createDraftOrderMock.mock.calls[0]!;
    expect(serviceInput.workspaceId).toBe(WORKSPACE_ID);
    expect(serviceInput).not.toHaveProperty("status");
    expect(serviceInput.items[0]).not.toHaveProperty("unitPrice");
  });

  it("turns a ValidationError into a readable message", async () => {
    createDraftOrderMock.mockRejectedValue(
      new ValidationError("One or more line items are invalid.", {
        "items.0.variantId": ["Variant not found in this workspace."],
      }),
    );

    const result = await createDraftOrderTool(auth).execute(validInput);

    expect(result).toEqual({
      status: "error",
      message: "One or more line items are invalid. Variant not found in this workspace.",
    });
  });

  it("turns a missing workspace into an error without creating anything", async () => {
    getCurrentWorkspaceMock.mockRejectedValue(
      new NotFoundError("No active workspace found for this seller."),
    );

    const result = await createDraftOrderTool(auth).execute(validInput);

    expect(createDraftOrderMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "error",
      message: "No active workspace found for this seller.",
    });
  });

  it("hides unexpected errors behind a generic message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    createDraftOrderMock.mockRejectedValue(new Error("connection reset at pg.js:42"));

    const result = await createDraftOrderTool(auth).execute(validInput);

    expect(result).toEqual({
      status: "error",
      message: "Could not create the draft order. Nothing was saved.",
    });
  });
});
