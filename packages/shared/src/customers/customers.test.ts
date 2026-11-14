import { describe, expect, it } from "vitest";

import {
  CUSTOMER_RECENT_ORDERS_LIMIT,
  CUSTOMER_TIMELINE_LIMIT,
  createCustomerNoteInputSchema,
  customerDetailSchema,
  customerListItemSchema,
  customerNoteSchema,
  customerSearchQuerySchema,
  customerSummarySchema,
  customerTagValues,
  customerTimelineEventSchema,
  deriveCustomerTags,
  normalizePhone,
  phoneNormalizationFixtures,
} from "./index.js";

const NOW = "2026-11-14T10:00:00.000Z";
const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SELLER_ID = "33333333-3333-4333-8333-333333333333";
const ORDER_ID = "44444444-4444-4444-8444-444444444444";
const NOTE_ID = "55555555-5555-4555-8555-555555555555";

const pkr = (amountMinor: number) => ({ amountMinor, currency: "PKR" });

function summary(overrides: Record<string, unknown> = {}) {
  return {
    lifetimeSpend: pkr(500000),
    averageOrderValue: pkr(250000),
    totalOrderCount: 3,
    completedOrderCount: 2,
    statusCounts: {
      draft: 0,
      confirmed: 1,
      shipped: 0,
      delivered: 1,
      cancelled: 1,
      returned: 0,
    },
    firstOrderAt: NOW,
    lastOrderAt: NOW,
    noteCount: 0,
    riskNoteCount: 0,
    ...overrides,
  };
}

function customer(overrides: Record<string, unknown> = {}) {
  return {
    id: CUSTOMER_ID,
    workspaceId: WORKSPACE_ID,
    sellerId: SELLER_ID,
    name: "Ayesha Khan",
    phone: "+923001234567",
    email: "ayesha@example.com",
    city: "Lahore",
    addressLine: "House 4, Gulberg",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function note(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTE_ID,
    customerId: CUSTOMER_ID,
    workspaceId: WORKSPACE_ID,
    sellerId: SELLER_ID,
    kind: "risk",
    body: "Refused delivery twice",
    createdBy: SELLER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function orderListItem(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    sellerId: SELLER_ID,
    workspaceId: WORKSPACE_ID,
    customerId: CUSTOMER_ID,
    status: "confirmed",
    channel: "manual",
    paymentMethod: "cod",
    total: pkr(250000),
    currency: "PKR",
    confirmedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    customerName: "Ayesha Khan",
    customerPhone: "+923001234567",
    customerCity: "Lahore",
    itemCount: 1,
    ...overrides,
  };
}

describe("normalizePhone", () => {
  it.each(phoneNormalizationFixtures)(
    "normalises $input to $expected",
    ({ input, expected }) => {
      expect(normalizePhone(input)).toBe(expected);
    },
  );

  it("is idempotent over every fixture result", () => {
    for (const { expected } of phoneNormalizationFixtures) {
      expect(normalizePhone(expected)).toBe(expected);
    }
  });
});

describe("customerSummarySchema", () => {
  it("accepts a summary", () => {
    expect(customerSummarySchema.safeParse(summary()).success).toBe(true);
  });

  it("accepts a customer with no orders", () => {
    const result = customerSummarySchema.safeParse(
      summary({
        lifetimeSpend: pkr(0),
        averageOrderValue: null,
        totalOrderCount: 0,
        completedOrderCount: 0,
        firstOrderAt: null,
        lastOrderAt: null,
        statusCounts: {
          draft: 0,
          confirmed: 0,
          shipped: 0,
          delivered: 0,
          cancelled: 0,
          returned: 0,
        },
      }),
    );
    expect(result.success).toBe(true);
  });

  it("allows lifetime spend above the single-order money cap", () => {
    const result = customerSummarySchema.safeParse(
      summary({ lifetimeSpend: pkr(5_000_000_000) }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects negative or fractional spend", () => {
    expect(
      customerSummarySchema.safeParse(summary({ lifetimeSpend: pkr(-1) })).success,
    ).toBe(false);
    expect(
      customerSummarySchema.safeParse(summary({ lifetimeSpend: pkr(1.5) })).success,
    ).toBe(false);
  });

  it("requires a count for every order status", () => {
    const { returned: _returned, ...partial } = summary().statusCounts;
    expect(
      customerSummarySchema.safeParse(summary({ statusCounts: partial })).success,
    ).toBe(false);
  });
});

describe("deriveCustomerTags", () => {
  const base = {
    completedOrderCount: 1,
    riskNoteCount: 0,
    statusCounts: { returned: 0 },
  };

  it("tags a customer with no completed orders as new", () => {
    expect(deriveCustomerTags({ ...base, completedOrderCount: 0 })).toEqual(["new"]);
  });

  it("gives a single completed order no tag", () => {
    expect(deriveCustomerTags(base)).toEqual([]);
  });

  it("tags two or more completed orders as repeat", () => {
    expect(deriveCustomerTags({ ...base, completedOrderCount: 2 })).toEqual(["repeat"]);
  });

  it("combines tags", () => {
    expect(
      deriveCustomerTags({
        completedOrderCount: 3,
        riskNoteCount: 1,
        statusCounts: { returned: 2 },
      }),
    ).toEqual(["repeat", "has_returns", "flagged"]);
  });

  it("only produces known tags", () => {
    const tags = deriveCustomerTags({
      completedOrderCount: 0,
      riskNoteCount: 1,
      statusCounts: { returned: 1 },
    });
    for (const tag of tags) expect(customerTagValues).toContain(tag);
  });
});

describe("customer list item and detail", () => {
  it("accepts a list item", () => {
    expect(
      customerListItemSchema.safeParse({
        ...customer(),
        summary: summary(),
        tags: ["repeat"],
      }).success,
    ).toBe(true);
  });

  it("accepts a customer without email or address", () => {
    expect(
      customerListItemSchema.safeParse({
        ...customer({ email: null, addressLine: undefined }),
        summary: summary(),
        tags: [],
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown tag", () => {
    expect(
      customerListItemSchema.safeParse({
        ...customer(),
        summary: summary(),
        tags: ["vip"],
      }).success,
    ).toBe(false);
  });

  const detail = (overrides: Record<string, unknown> = {}) => ({
    ...customer(),
    summary: summary(),
    tags: ["repeat", "flagged"],
    recentOrders: [orderListItem()],
    notes: [note()],
    timeline: [
      {
        type: "note_added",
        noteId: NOTE_ID,
        kind: "risk",
        body: "Refused delivery twice",
        at: NOW,
      },
      {
        type: "order_status_changed",
        orderId: ORDER_ID,
        fromStatus: null,
        toStatus: "draft",
        note: "Draft order created",
        at: NOW,
      },
    ],
    ...overrides,
  });

  it("accepts a detail", () => {
    expect(customerDetailSchema.safeParse(detail()).success).toBe(true);
  });

  it("caps recent orders and the timeline", () => {
    expect(
      customerDetailSchema.safeParse(
        detail({
          recentOrders: Array.from({ length: CUSTOMER_RECENT_ORDERS_LIMIT + 1 }, () =>
            orderListItem(),
          ),
        }),
      ).success,
    ).toBe(false);

    const event = {
      type: "order_status_changed",
      orderId: ORDER_ID,
      fromStatus: "draft",
      toStatus: "confirmed",
      note: null,
      at: NOW,
    };
    expect(
      customerDetailSchema.safeParse(
        detail({
          timeline: Array.from({ length: CUSTOMER_TIMELINE_LIMIT + 1 }, () => event),
        }),
      ).success,
    ).toBe(false);
  });
});

describe("customerTimelineEventSchema", () => {
  it("accepts an order status change with a null fromStatus", () => {
    expect(
      customerTimelineEventSchema.safeParse({
        type: "order_status_changed",
        orderId: ORDER_ID,
        fromStatus: null,
        toStatus: "draft",
        note: null,
        at: NOW,
      }).success,
    ).toBe(true);
  });

  it("accepts a note event", () => {
    expect(
      customerTimelineEventSchema.safeParse({
        type: "note_added",
        noteId: NOTE_ID,
        kind: "note",
        body: "Prefers evening delivery",
        at: NOW,
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown event type", () => {
    expect(
      customerTimelineEventSchema.safeParse({
        type: "conversation_message",
        at: NOW,
      }).success,
    ).toBe(false);
  });

  it("rejects a status event with an unknown status", () => {
    expect(
      customerTimelineEventSchema.safeParse({
        type: "order_status_changed",
        orderId: ORDER_ID,
        fromStatus: null,
        toStatus: "lost",
        note: null,
        at: NOW,
      }).success,
    ).toBe(false);
  });
});

describe("customer notes", () => {
  it("accepts a note", () => {
    expect(customerNoteSchema.safeParse(note()).success).toBe(true);
  });

  it("defaults the kind to note and trims the body", () => {
    const parsed = createCustomerNoteInputSchema.parse({
      workspaceId: WORKSPACE_ID,
      body: "  Calls before delivery  ",
    });
    expect(parsed).toMatchObject({ kind: "note", body: "Calls before delivery" });
  });

  it("rejects blank and over-long bodies and unknown kinds", () => {
    const input = { workspaceId: WORKSPACE_ID, body: "ok" };
    expect(createCustomerNoteInputSchema.safeParse({ ...input, body: "   " }).success).toBe(false);
    expect(
      createCustomerNoteInputSchema.safeParse({ ...input, body: "x".repeat(2001) }).success,
    ).toBe(false);
    expect(
      createCustomerNoteInputSchema.safeParse({ ...input, body: "x".repeat(2000) }).success,
    ).toBe(true);
    expect(createCustomerNoteInputSchema.safeParse({ ...input, kind: "warning" }).success).toBe(
      false,
    );
  });
});

describe("customerSearchQuerySchema", () => {
  it("applies defaults", () => {
    const parsed = customerSearchQuerySchema.parse({ workspaceId: WORKSPACE_ID });
    expect(parsed).toMatchObject({ sort: "last_order_desc", limit: 25 });
  });

  it("accepts query, tags and each sort", () => {
    for (const sort of ["last_order_desc", "spend_desc", "name_asc", "created_desc"]) {
      expect(
        customerSearchQuerySchema.safeParse({
          workspaceId: WORKSPACE_ID,
          query: "ayesha",
          tags: ["repeat", "flagged"],
          sort,
          limit: 100,
        }).success,
      ).toBe(true);
    }
  });

  it("rejects bad input", () => {
    const base = { workspaceId: WORKSPACE_ID };
    expect(customerSearchQuerySchema.safeParse({ ...base, sort: "newest" }).success).toBe(false);
    expect(customerSearchQuerySchema.safeParse({ ...base, tags: ["vip"] }).success).toBe(false);
    expect(customerSearchQuerySchema.safeParse({ ...base, limit: 0 }).success).toBe(false);
    expect(customerSearchQuerySchema.safeParse({ ...base, limit: 101 }).success).toBe(false);
    expect(customerSearchQuerySchema.safeParse({ ...base, query: "" }).success).toBe(false);
    expect(customerSearchQuerySchema.safeParse({ workspaceId: "nope" }).success).toBe(false);
  });
});
