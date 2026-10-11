import { describe, expect, it } from "vitest";

import {
  ORDER_STATUS_TRANSITIONS,
  assertTransition,
  canTransition,
  createDraftOrderInputSchema,
  orderChannelValues,
  orderContractVersion,
  orderItemSchema,
  orderPaymentMethodValues,
  orderSchema,
  orderSearchQuerySchema,
  orderStatusHistorySchema,
  orderStatusValues,
  transitionOrderStatusInputSchema,
} from "./index.js";

const NOW = "2026-10-11T10:00:00.000Z";
const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";
const VARIANT_ID = "44444444-4444-4444-8444-444444444444";
const SELLER_ID = "55555555-5555-4555-8555-555555555555";
const WORKSPACE_ID = "66666666-6666-4666-8666-666666666666";
const USER_ID = "77777777-7777-4777-8777-777777777777";
const HISTORY_ID = "88888888-8888-4888-8888-888888888888";

function money(amountMinor: number) {
  return { amountMinor, currency: "PKR" as const };
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    orderId: ORDER_ID,
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    title: "Lawn Kurta",
    variantTitle: "Medium",
    sku: "LK-M",
    quantity: 2,
    unitPrice: money(150_000),
    lineTotal: money(300_000),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    sellerId: SELLER_ID,
    workspaceId: WORKSPACE_ID,
    status: "draft",
    channel: "whatsapp",
    paymentMethod: "cod",
    customer: {
      name: "Ahmed Khan",
      phone: "+923001234567",
      city: "Lahore",
      email: null,
      addressLine: "House 12, Street 3, Gulberg III",
    },
    items: [item()],
    subtotal: money(300_000),
    shippingFee: money(0),
    total: money(300_000),
    currency: "PKR",
    note: null,
    confirmedAt: null,
    cancelledAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function history(overrides: Record<string, unknown> = {}) {
  return {
    id: HISTORY_ID,
    orderId: ORDER_ID,
    sellerId: SELLER_ID,
    workspaceId: WORKSPACE_ID,
    fromStatus: "draft",
    toStatus: "confirmed",
    performedBy: USER_ID,
    note: null,
    createdAt: NOW,
    ...overrides,
  };
}

describe("order contract", () => {
  it("contract version is pinned", () => {
    expect(orderContractVersion).toBe("2026-10-11");
  });
});

describe("orderStatusValues", () => {
  it("statuses are a closed list of six", () => {
    expect([...orderStatusValues]).toEqual([
      "draft",
      "confirmed",
      "shipped",
      "delivered",
      "cancelled",
      "returned",
    ]);
  });
});

describe("orderChannelValues", () => {
  it("channels are a closed MVP list", () => {
    expect([...orderChannelValues]).toEqual([
      "whatsapp",
      "shopify",
      "woocommerce",
      "instagram",
      "facebook",
      "manual",
    ]);
  });
});

describe("ORDER_STATUS_TRANSITIONS / canTransition", () => {
  const legal: Array<[string, string]> = [
    ["draft", "confirmed"],
    ["draft", "cancelled"],
    ["confirmed", "shipped"],
    ["confirmed", "cancelled"],
    ["shipped", "delivered"],
    ["shipped", "returned"],
    ["delivered", "returned"],
  ];

  it.each(legal)("allows %s → %s", (from, to) => {
    expect(canTransition(from as never, to as never)).toBe(true);
  });

  const illegal: Array<[string, string]> = [
    ["draft", "shipped"],
    ["draft", "delivered"],
    ["draft", "returned"],
    ["confirmed", "delivered"],
    ["confirmed", "draft"],
    ["shipped", "confirmed"],
    ["delivered", "shipped"],
    ["cancelled", "confirmed"],
    ["cancelled", "draft"],
    ["returned", "delivered"],
    ["draft", "draft"],
  ];

  it.each(illegal)("rejects %s → %s", (from, to) => {
    expect(canTransition(from as never, to as never)).toBe(false);
  });

  it("assertTransition throws on illegal moves", () => {
    expect(() => assertTransition("draft", "shipped")).toThrow(
      /Illegal order status transition/,
    );
  });

  it("assertTransition is silent on legal moves", () => {
    expect(() => assertTransition("draft", "confirmed")).not.toThrow();
  });

  it("terminal statuses have empty allow-lists", () => {
    expect(ORDER_STATUS_TRANSITIONS.cancelled).toEqual([]);
    expect(ORDER_STATUS_TRANSITIONS.returned).toEqual([]);
  });
});

describe("orderItemSchema", () => {
  it("accepts a well-formed line item", () => {
    expect(orderItemSchema.safeParse(item()).success).toBe(true);
  });

  it("rejects quantity below 1", () => {
    expect(orderItemSchema.safeParse(item({ quantity: 0 })).success).toBe(
      false,
    );
  });

  it("rejects line total that does not match qty × unit price", () => {
    expect(
      orderItemSchema.safeParse(item({ lineTotal: money(100) })).success,
    ).toBe(false);
  });
});

describe("orderSchema", () => {
  it("accepts a well-formed draft order", () => {
    expect(orderSchema.safeParse(order()).success).toBe(true);
  });

  it("accepts a confirmed order with confirmedAt", () => {
    expect(
      orderSchema.safeParse(
        order({ status: "confirmed", confirmedAt: NOW }),
      ).success,
    ).toBe(true);
  });

  it("rejects an order with no items", () => {
    expect(orderSchema.safeParse(order({ items: [] })).success).toBe(false);
  });

  it("rejects subtotal that does not match item line totals", () => {
    expect(
      orderSchema.safeParse(order({ subtotal: money(1), total: money(1) }))
        .success,
    ).toBe(false);
  });

  it("rejects draft orders that carry confirmedAt", () => {
    expect(
      orderSchema.safeParse(order({ confirmedAt: NOW })).success,
    ).toBe(false);
  });

  it("rejects confirmed-path orders without confirmedAt", () => {
    expect(
      orderSchema.safeParse(order({ status: "confirmed", confirmedAt: null }))
        .success,
    ).toBe(false);
  });

  it("accepts an order with shipping fee where total equals subtotal plus shipping fee", () => {
    const result = orderSchema.safeParse(
      order({
        subtotal: money(300_000),
        shippingFee: money(25_000),
        total: money(325_000),
      }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects an order where total does not equal subtotal plus shipping fee", () => {
    expect(
      orderSchema.safeParse(
        order({
          subtotal: money(300_000),
          shippingFee: money(25_000),
          total: money(300_000),
        }),
      ).success,
    ).toBe(false);
  });

  it("supports cod and prepaid payment methods", () => {
    expect([...orderPaymentMethodValues]).toEqual(["cod", "prepaid"]);
    expect(orderSchema.safeParse(order({ paymentMethod: "prepaid" })).success).toBe(
      true,
    );
    expect(orderSchema.safeParse(order({ paymentMethod: "cod" })).success).toBe(
      true,
    );
  });

  it("rejects confirmed-path orders without delivery addressLine", () => {
    expect(
      orderSchema.safeParse(
        order({
          status: "confirmed",
          confirmedAt: NOW,
          customer: {
            name: "Ahmed Khan",
            phone: "+923001234567",
            city: "Lahore",
            email: null,
            addressLine: null,
          },
        }),
      ).success,
    ).toBe(false);
  });

  it("accepts draft orders even without customer addressLine", () => {
    expect(
      orderSchema.safeParse(
        order({
          status: "draft",
          customer: {
            name: "Ahmed Khan",
            phone: "+923001234567",
            city: "Lahore",
            email: null,
            addressLine: null,
          },
        }),
      ).success,
    ).toBe(true);
  });
});

describe("orderStatusHistorySchema", () => {
  it("accepts a legal transition history row", () => {
    expect(orderStatusHistorySchema.safeParse(history()).success).toBe(true);
  });

  it("accepts the initial draft creation row", () => {
    expect(
      orderStatusHistorySchema.safeParse(
        history({ fromStatus: null, toStatus: "draft" }),
      ).success,
    ).toBe(true);
  });

  it("rejects illegal from→to pairs", () => {
    expect(
      orderStatusHistorySchema.safeParse(
        history({ fromStatus: "draft", toStatus: "shipped" }),
      ).success,
    ).toBe(false);
  });

  it("rejects initial history that is not draft", () => {
    expect(
      orderStatusHistorySchema.safeParse(
        history({ fromStatus: null, toStatus: "confirmed" }),
      ).success,
    ).toBe(false);
  });
});

describe("createDraftOrderInputSchema", () => {
  it("accepts a minimal draft create payload", () => {
    const result = createDraftOrderInputSchema.safeParse({
      workspaceId: WORKSPACE_ID,
      customer: {
        name: "Ahmed Khan",
        phone: "+923001234567",
        city: "Lahore",
      },
      items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.channel).toBe("manual");
    }
  });

  it("does not accept a status field that would confirm immediately", () => {
    const result = createDraftOrderInputSchema.safeParse({
      workspaceId: WORKSPACE_ID,
      status: "confirmed",
      customer: {
        name: "Ahmed Khan",
        phone: "+923001234567",
        city: "Lahore",
      },
      items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }],
    });

    // Zod strips unknown keys by default in this package's schemas —
    // ensure parsed output never carries a confirmable status.
    expect(result.success).toBe(true);
    if (result.success) {
      expect("status" in result.data).toBe(false);
    }
  });

  it("rejects empty items", () => {
    expect(
      createDraftOrderInputSchema.safeParse({
        workspaceId: WORKSPACE_ID,
        customer: {
          name: "Ahmed Khan",
          phone: "+923001234567",
          city: "Lahore",
        },
        items: [],
      }).success,
    ).toBe(false);
  });
});

describe("transitionOrderStatusInputSchema", () => {
  it("accepts a confirm transition input", () => {
    expect(
      transitionOrderStatusInputSchema.safeParse({
        workspaceId: WORKSPACE_ID,
        orderId: ORDER_ID,
        toStatus: "confirmed",
      }).success,
    ).toBe(true);
  });

  it("rejects transitioning back to draft", () => {
    expect(
      transitionOrderStatusInputSchema.safeParse({
        workspaceId: WORKSPACE_ID,
        orderId: ORDER_ID,
        toStatus: "draft",
      }).success,
    ).toBe(false);
  });
});

describe("orderSearchQuerySchema", () => {
  it("defaults sort and limit", () => {
    const result = orderSearchQuerySchema.parse({
      workspaceId: WORKSPACE_ID,
    });
    expect(result.sort).toBe("updated_desc");
    expect(result.limit).toBe(25);
  });

  it("accepts status and channel filters", () => {
    expect(
      orderSearchQuerySchema.safeParse({
        workspaceId: WORKSPACE_ID,
        statuses: ["draft", "confirmed"],
        channels: ["whatsapp", "manual"],
      }).success,
    ).toBe(true);
  });
});
