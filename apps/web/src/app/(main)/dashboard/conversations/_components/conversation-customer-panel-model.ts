import type { Conversation } from "@pakcommerce/shared/conversations";

/** How to look the buyer up: by the linked customer id when set, else by phone. */
export type CustomerLookup = { customerId: string } | { phone: string };

export function customerLookupFor(conversation: Pick<Conversation, "customerId" | "buyerPhone">): CustomerLookup {
  return conversation.customerId ? { customerId: conversation.customerId } : { phone: conversation.buyerPhone };
}

/** Stable key so the panel refetches only when the lookup really changes. */
export function customerLookupKey(lookup: CustomerLookup): string {
  return "customerId" in lookup ? `id:${lookup.customerId}` : `phone:${lookup.phone}`;
}

/** Order count label, e.g. "3 orders (2 completed)". */
export function orderCountLabel(total: number, completed: number): string {
  const noun = total === 1 ? "order" : "orders";
  return total === completed ? `${total} ${noun}` : `${total} ${noun} (${completed} completed)`;
}
