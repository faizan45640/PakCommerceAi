import { normalizePhone } from "@pakcommerce/shared/customers";

export type CustomerProfileTarget = { customerId: string } | { phone: string };

/**
 * Where a customer's profile lives. With an id it is the profile route; with
 * only a phone (e.g. a conversation) it is the list's `?phone=` hook, which
 * redirects to the profile when that phone belongs to a customer.
 */
export function customerProfileHref(target: CustomerProfileTarget): string {
  if ("customerId" in target) return `/dashboard/customers/${target.customerId}`;
  return `/dashboard/customers?phone=${encodeURIComponent(normalizePhone(target.phone))}`;
}
