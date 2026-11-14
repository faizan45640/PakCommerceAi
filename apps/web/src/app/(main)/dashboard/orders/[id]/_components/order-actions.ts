import { canTransition, type OrderDetail, type OrderStatus } from "@pakcommerce/shared/orders";

/** Statuses the API lets a draft move to today (DB enables only these). */
const ENABLED_FROM_DRAFT: readonly OrderStatus[] = ["confirmed", "cancelled"];

export function canOfferTransition(order: OrderDetail, to: OrderStatus): boolean {
  return order.status === "draft" && ENABLED_FROM_DRAFT.includes(to) && canTransition(order.status, to);
}

/**
 * Reasons Confirm is blocked. Mirrors transition_order_status: an address is
 * required, and every stock-tracked line needs available >= needed. The API
 * stays the authority; this only avoids a request that is certain to fail.
 */
export function confirmBlockers(order: OrderDetail): string[] {
  const reasons: string[] = [];
  if (!order.customer.addressLine?.trim()) {
    reasons.push("Add a delivery address before confirming.");
  }
  const short = order.stockChecks.filter((check) => !check.sufficient);
  if (short.length > 0) {
    reasons.push(
      `Not enough stock for ${short.length} item${short.length === 1 ? "" : "s"}.`,
    );
  }
  return reasons;
}
