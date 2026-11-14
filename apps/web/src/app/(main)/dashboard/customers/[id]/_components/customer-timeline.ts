import type { CustomerTimelineEvent } from "@pakcommerce/shared";

import { ORDER_STATUS_LABELS, shortOrderId } from "../../../orders/_components/order-badges";

export interface TimelineItem {
  key: string;
  tone: "order" | "note" | "risk";
  title: string;
  detail?: string;
  href?: string;
  at: string;
}

/** One timeline row from an API event; the API already sends them newest first. */
export function formatTimelineEvent(event: CustomerTimelineEvent, index: number): TimelineItem {
  if (event.type === "order_status_changed") {
    const order = `Order #${shortOrderId(event.orderId)}`;
    return {
      key: `order-${event.orderId}-${event.at}-${index}`,
      tone: "order",
      title: event.fromStatus
        ? `${order} ${ORDER_STATUS_LABELS[event.fromStatus]} → ${ORDER_STATUS_LABELS[event.toStatus]}`
        : `${order} created as ${ORDER_STATUS_LABELS[event.toStatus]}`,
      detail: event.note ?? undefined,
      href: `/dashboard/orders/${event.orderId}`,
      at: event.at,
    };
  }

  return {
    key: `note-${event.noteId}`,
    tone: event.kind === "risk" ? "risk" : "note",
    title: event.kind === "risk" ? "Risk note added" : "Note added",
    detail: event.body,
    at: event.at,
  };
}
