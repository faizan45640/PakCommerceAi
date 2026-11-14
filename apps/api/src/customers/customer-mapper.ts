import type { Database } from "@pakcommerce/integrations/supabase";
import {
  CUSTOMER_TIMELINE_LIMIT,
  deriveCustomerTags,
  type Customer,
  type CustomerDetail,
  type CustomerListItem,
  type CustomerNote,
  type CustomerNoteKind,
  type CustomerSummary,
  type CustomerTimelineEvent,
  type OrderListItem,
  type OrderStatus,
} from "@pakcommerce/shared";

/**
 * Translates customer rows into the shared customer contract.
 *
 * `customer_summary` is a view, so the generated types mark every column
 * nullable. The view never actually yields nulls for the columns typed
 * non-null below, so the API reads rows as `CustomerSummaryRow` instead.
 * Pure functions, tested without a database.
 */

export type CustomerNoteRow = Database["public"]["Tables"]["customer_notes"]["Row"];
export type OrderStatusHistoryRow =
  Database["public"]["Tables"]["order_status_history"]["Row"];

/** One row of the `customer_summary` view (customer columns + computed columns). */
export interface CustomerSummaryRow {
  id: string;
  workspace_id: string;
  seller_id: string;
  name: string;
  phone: string;
  email: string | null;
  city: string;
  address_line: string | null;
  created_at: string;
  updated_at: string;
  total_order_count: number;
  completed_order_count: number;
  lifetime_spend_amount_minor: number;
  average_order_amount_minor: number | null;
  draft_order_count: number;
  confirmed_order_count: number;
  shipped_order_count: number;
  delivered_order_count: number;
  cancelled_order_count: number;
  returned_order_count: number;
  first_order_at: string | null;
  last_order_at: string | null;
  note_count: number;
  risk_note_count: number;
}

/** The history columns the timeline needs. */
export type TimelineHistoryRow = Pick<
  OrderStatusHistoryRow,
  "id" | "order_id" | "from_status" | "to_status" | "note" | "created_at"
>;

export function toCustomer(row: CustomerSummaryRow): Customer {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sellerId: row.seller_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    city: row.city,
    addressLine: row.address_line,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Postgres returns `bigint` as a number through PostgREST; coerce defensively. */
function toCount(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

export function toCustomerSummary(row: CustomerSummaryRow): CustomerSummary {
  const average = row.average_order_amount_minor;

  return {
    lifetimeSpend: {
      amountMinor: toCount(row.lifetime_spend_amount_minor),
      currency: "PKR",
    },
    averageOrderValue:
      average === null || average === undefined
        ? null
        : { amountMinor: toCount(average), currency: "PKR" },
    totalOrderCount: toCount(row.total_order_count),
    completedOrderCount: toCount(row.completed_order_count),
    statusCounts: {
      draft: toCount(row.draft_order_count),
      confirmed: toCount(row.confirmed_order_count),
      shipped: toCount(row.shipped_order_count),
      delivered: toCount(row.delivered_order_count),
      cancelled: toCount(row.cancelled_order_count),
      returned: toCount(row.returned_order_count),
    },
    firstOrderAt: row.first_order_at,
    lastOrderAt: row.last_order_at,
    noteCount: toCount(row.note_count),
    riskNoteCount: toCount(row.risk_note_count),
  };
}

export function toCustomerListItem(row: CustomerSummaryRow): CustomerListItem {
  const summary = toCustomerSummary(row);

  return {
    ...toCustomer(row),
    summary,
    tags: deriveCustomerTags(summary),
  };
}

export function toCustomerNote(row: CustomerNoteRow): CustomerNote {
  return {
    id: row.id,
    customerId: row.customer_id,
    workspaceId: row.workspace_id,
    sellerId: row.seller_id,
    kind: row.kind as CustomerNoteKind,
    body: row.body,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Merges status changes and notes into one feed, newest first, capped.
 * Ties keep status changes before notes so the order is deterministic.
 */
export function toTimeline(
  historyRows: TimelineHistoryRow[],
  noteRows: CustomerNoteRow[],
  limit: number = CUSTOMER_TIMELINE_LIMIT,
): CustomerTimelineEvent[] {
  const events: CustomerTimelineEvent[] = [
    ...historyRows.map(
      (row): CustomerTimelineEvent => ({
        type: "order_status_changed",
        orderId: row.order_id,
        fromStatus: row.from_status as OrderStatus | null,
        toStatus: row.to_status as OrderStatus,
        note: row.note,
        at: row.created_at,
      }),
    ),
    ...noteRows.map(
      (row): CustomerTimelineEvent => ({
        type: "note_added",
        noteId: row.id,
        kind: row.kind as CustomerNoteKind,
        body: row.body,
        at: row.created_at,
      }),
    ),
  ];

  // Compare instants, not strings: offsets and fractional digits can differ.
  return events
    .map((event, index) => ({ event, index, time: Date.parse(event.at) }))
    .sort((a, b) => b.time - a.time || a.index - b.index)
    .slice(0, limit)
    .map(({ event }) => event);
}

export function toCustomerDetail(
  item: CustomerListItem,
  recentOrders: OrderListItem[],
  notes: CustomerNote[],
  timeline: CustomerTimelineEvent[],
): CustomerDetail {
  return { ...item, recentOrders, notes, timeline };
}
