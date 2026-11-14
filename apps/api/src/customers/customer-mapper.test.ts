import {
  customerDetailSchema,
  customerListItemSchema,
  customerNoteSchema,
  customerTimelineEventSchema,
} from "@pakcommerce/shared";
import { describe, expect, it } from "vitest";

import {
  toCustomer,
  toCustomerDetail,
  toCustomerListItem,
  toCustomerNote,
  toCustomerSummary,
  toTimeline,
  type CustomerNoteRow,
  type CustomerSummaryRow,
  type TimelineHistoryRow,
} from "./customer-mapper.js";

const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SELLER_ID = "33333333-3333-4333-8333-333333333333";
const ORDER_ID = "44444444-4444-4444-8444-444444444444";

function summaryRow(overrides: Partial<CustomerSummaryRow> = {}): CustomerSummaryRow {
  return {
    id: CUSTOMER_ID,
    workspace_id: WORKSPACE_ID,
    seller_id: SELLER_ID,
    name: "Ayesha Khan",
    phone: "+923001234567",
    email: "ayesha@example.com",
    city: "Lahore",
    address_line: "House 4",
    created_at: "2026-11-01T10:00:00.123456+00:00",
    updated_at: "2026-11-02T10:00:00.123456+00:00",
    total_order_count: 4,
    completed_order_count: 2,
    lifetime_spend_amount_minor: 600000,
    average_order_amount_minor: 300000,
    draft_order_count: 1,
    confirmed_order_count: 1,
    shipped_order_count: 0,
    delivered_order_count: 1,
    cancelled_order_count: 1,
    returned_order_count: 0,
    first_order_at: "2026-11-01T10:00:00.123456+00:00",
    last_order_at: "2026-11-10T10:00:00.123456+00:00",
    note_count: 0,
    risk_note_count: 0,
    ...overrides,
  };
}

function noteRow(overrides: Partial<CustomerNoteRow> = {}): CustomerNoteRow {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    customer_id: CUSTOMER_ID,
    workspace_id: WORKSPACE_ID,
    seller_id: SELLER_ID,
    kind: "risk",
    body: "Refused delivery",
    created_by: SELLER_ID,
    created_at: "2026-11-05T10:00:00+00:00",
    updated_at: "2026-11-05T10:00:00+00:00",
    ...overrides,
  };
}

function historyRow(overrides: Partial<TimelineHistoryRow> = {}): TimelineHistoryRow {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    order_id: ORDER_ID,
    from_status: null,
    to_status: "draft",
    note: "Draft order created",
    created_at: "2026-11-01T10:00:00+00:00",
    ...overrides,
  };
}

describe("toCustomer", () => {
  it("maps snake_case columns to the contract", () => {
    expect(toCustomer(summaryRow())).toEqual({
      id: CUSTOMER_ID,
      workspaceId: WORKSPACE_ID,
      sellerId: SELLER_ID,
      name: "Ayesha Khan",
      phone: "+923001234567",
      email: "ayesha@example.com",
      city: "Lahore",
      addressLine: "House 4",
      createdAt: "2026-11-01T10:00:00.123456+00:00",
      updatedAt: "2026-11-02T10:00:00.123456+00:00",
    });
  });
});

describe("toCustomerSummary", () => {
  it("maps money to PKR minor units and status counts", () => {
    const summary = toCustomerSummary(summaryRow());

    expect(summary.lifetimeSpend).toEqual({ amountMinor: 600000, currency: "PKR" });
    expect(summary.averageOrderValue).toEqual({ amountMinor: 300000, currency: "PKR" });
    expect(summary.statusCounts).toEqual({
      draft: 1,
      confirmed: 1,
      shipped: 0,
      delivered: 1,
      cancelled: 1,
      returned: 0,
    });
    expect(summary.totalOrderCount).toBe(4);
    expect(summary.completedOrderCount).toBe(2);
  });

  it("has no average order value when nothing is completed", () => {
    const summary = toCustomerSummary(
      summaryRow({
        completed_order_count: 0,
        lifetime_spend_amount_minor: 0,
        average_order_amount_minor: null,
      }),
    );
    expect(summary.averageOrderValue).toBeNull();
    expect(summary.lifetimeSpend.amountMinor).toBe(0);
  });

  it("coerces numeric strings (bigint) to numbers", () => {
    const summary = toCustomerSummary(
      summaryRow({
        lifetime_spend_amount_minor: "5000000000" as unknown as number,
      }),
    );
    expect(summary.lifetimeSpend.amountMinor).toBe(5_000_000_000);
  });

  it("keeps a customer with no orders at zero with null dates", () => {
    const summary = toCustomerSummary(
      summaryRow({
        total_order_count: 0,
        completed_order_count: 0,
        lifetime_spend_amount_minor: 0,
        average_order_amount_minor: null,
        draft_order_count: 0,
        confirmed_order_count: 0,
        delivered_order_count: 0,
        cancelled_order_count: 0,
        first_order_at: null,
        last_order_at: null,
      }),
    );
    expect(summary.firstOrderAt).toBeNull();
    expect(summary.lastOrderAt).toBeNull();
    expect(summary.totalOrderCount).toBe(0);
  });
});

describe("toCustomerListItem tags", () => {
  const tags = (overrides: Partial<CustomerSummaryRow>) =>
    toCustomerListItem(summaryRow(overrides)).tags;

  it("tags a customer with no completed orders as first_time", () => {
    expect(tags({ completed_order_count: 0, total_order_count: 1 })).toEqual(["first_time"]);
  });

  it("tags two completed orders as repeat", () => {
    expect(tags({ completed_order_count: 2 })).toEqual(["repeat"]);
  });

  it("adds has_returns and flagged", () => {
    expect(
      tags({ completed_order_count: 3, returned_order_count: 1, risk_note_count: 2 }),
    ).toEqual(["repeat", "has_returns", "flagged"]);
  });

  it("produces a contract-valid list item", () => {
    expect(customerListItemSchema.safeParse(toCustomerListItem(summaryRow())).success).toBe(
      true,
    );
  });
});

describe("toCustomerNote", () => {
  it("maps a note row", () => {
    const note = toCustomerNote(noteRow());
    expect(note).toMatchObject({
      customerId: CUSTOMER_ID,
      kind: "risk",
      body: "Refused delivery",
      createdBy: SELLER_ID,
    });
    expect(customerNoteSchema.safeParse(note).success).toBe(true);
  });
});

describe("toTimeline", () => {
  it("merges status changes and notes, newest first", () => {
    const timeline = toTimeline(
      [
        historyRow({ created_at: "2026-11-01T10:00:00+00:00" }),
        historyRow({
          id: "77777777-7777-4777-8777-777777777777",
          from_status: "draft",
          to_status: "confirmed",
          note: null,
          created_at: "2026-11-03T10:00:00+00:00",
        }),
      ],
      [noteRow({ created_at: "2026-11-02T10:00:00+00:00" })],
    );

    expect(timeline.map((event) => event.type)).toEqual([
      "order_status_changed",
      "note_added",
      "order_status_changed",
    ]);
    expect(timeline[0]).toMatchObject({ fromStatus: "draft", toStatus: "confirmed" });
    expect(timeline[2]).toMatchObject({ fromStatus: null, toStatus: "draft" });
    for (const event of timeline) {
      expect(customerTimelineEventSchema.safeParse(event).success).toBe(true);
    }
  });

  it("compares instants across different offsets and precisions", () => {
    const timeline = toTimeline(
      [historyRow({ created_at: "2026-11-01T10:00:00.5+00:00" })],
      [noteRow({ created_at: "2026-11-01T15:00:00+05:00" })],
    );
    // 15:00+05:00 is 10:00:00Z, which is before 10:00:00.5Z.
    expect(timeline.map((event) => event.type)).toEqual([
      "order_status_changed",
      "note_added",
    ]);
  });

  it("caps the timeline", () => {
    const rows = Array.from({ length: 60 }, (_, index) =>
      historyRow({
        id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        created_at: new Date(Date.UTC(2026, 10, 1, 0, index)).toISOString(),
      }),
    );
    const timeline = toTimeline(rows, []);
    expect(timeline).toHaveLength(50);
    expect(timeline[0]?.at).toBe(rows[59]?.created_at);
  });

  it("is empty when there is nothing", () => {
    expect(toTimeline([], [])).toEqual([]);
  });
});

describe("toCustomerDetail", () => {
  it("assembles a contract-valid detail", () => {
    const note = toCustomerNote(noteRow());
    const detail = toCustomerDetail(
      toCustomerListItem(summaryRow({ note_count: 1, risk_note_count: 1 })),
      [],
      [note],
      toTimeline([historyRow()], [noteRow()]),
    );

    expect(detail.tags).toContain("flagged");
    expect(customerDetailSchema.safeParse(detail).success).toBe(true);
  });
});
