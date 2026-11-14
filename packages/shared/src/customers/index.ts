import { z } from "zod";

import {
  orderListItemSchema,
  orderStatusSchema,
  orderStatusValues,
} from "@pakcommerce/shared/orders";
import { moneySchema } from "@pakcommerce/shared/products";

export { normalizePhone, phoneNormalizationFixtures } from "./phone.js";

export const customerContractVersion = "2026-11-14";

/** Orders shown on the profile; the full history is `GET /orders?customerId=`. */
export const CUSTOMER_RECENT_ORDERS_LIMIT = 20;
/** The timeline is capped, newest first. */
export const CUSTOMER_TIMELINE_LIMIT = 50;
export const MAX_CUSTOMER_NOTE_LENGTH = 2000;

export const customerTagValues = [
  "new",
  "repeat",
  "has_returns",
  "flagged",
] as const;

export const customerSortValues = [
  "last_order_desc",
  "spend_desc",
  "name_asc",
  "created_desc",
] as const;

export const customerNoteKindValues = ["note", "risk"] as const;

const idSchema = z.uuid();
const trimmedText = z.string().trim();
const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const customerTagSchema = z.enum(customerTagValues);
export const customerSortSchema = z.enum(customerSortValues);
export const customerNoteKindSchema = z.enum(customerNoteKindValues);

export type CustomerTag = z.infer<typeof customerTagSchema>;
export type CustomerSort = z.infer<typeof customerSortSchema>;
export type CustomerNoteKind = z.infer<typeof customerNoteKindSchema>;

/**
 * Money for sums. `moneySchema` caps one amount at a 32-bit integer (enough for
 * a single order); a customer's lifetime spend is a sum of orders and can
 * exceed it, so aggregates are only required to be safe integers.
 */
export const customerMoneySchema = moneySchema.extend({
  amountMinor: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

/**
 * A customer: one real person per workspace, identified by normalised phone.
 * Name, city, address and email are the latest values seen on their orders;
 * orders keep their own snapshot.
 */
export const customerSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  sellerId: idSchema,
  name: trimmedText.min(1).max(160),
  /** Normalised (see `normalizePhone`), e.g. `+923001234567`. */
  phone: trimmedText.min(1).max(32),
  /** Lower-cased. */
  email: z.email().nullable().optional(),
  city: trimmedText.min(1).max(80),
  addressLine: trimmedText.max(300).nullable().optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

const statusCountsShape = Object.fromEntries(
  orderStatusValues.map((status) => [status, z.int().nonnegative()]),
) as Record<(typeof orderStatusValues)[number], z.ZodInt>;

/**
 * Computed from the customer's orders, never stored.
 *
 * Lifetime spend = sum of `total` over confirmed, shipped and delivered orders
 * ("completed"). Drafts, cancelled and returned orders are excluded.
 */
export const customerSummarySchema = z.object({
  lifetimeSpend: customerMoneySchema,
  /** Mean total of completed orders; null when there are none. */
  averageOrderValue: customerMoneySchema.nullable(),
  totalOrderCount: z.int().nonnegative(),
  completedOrderCount: z.int().nonnegative(),
  statusCounts: z.object(statusCountsShape),
  /** `createdAt` of the earliest / latest order of any status. */
  firstOrderAt: isoDateTimeSchema.nullable(),
  lastOrderAt: isoDateTimeSchema.nullable(),
  noteCount: z.int().nonnegative(),
  /** Notes of kind `risk`; any makes the customer `flagged`. */
  riskNoteCount: z.int().nonnegative(),
});

/**
 * Status tags are derived, never stored; a customer can have several.
 *  - new: no completed orders yet
 *  - repeat: two or more completed orders
 *  - has_returns: at least one returned order
 *  - flagged: at least one risk note
 */
export function deriveCustomerTags(summary: {
  completedOrderCount: number;
  riskNoteCount: number;
  statusCounts: { returned: number };
}): CustomerTag[] {
  const tags: CustomerTag[] = [];
  if (summary.completedOrderCount === 0) tags.push("new");
  if (summary.completedOrderCount >= 2) tags.push("repeat");
  if (summary.statusCounts.returned >= 1) tags.push("has_returns");
  if (summary.riskNoteCount >= 1) tags.push("flagged");
  return tags;
}

export const customerNoteSchema = z.object({
  id: idSchema,
  customerId: idSchema,
  workspaceId: idSchema,
  sellerId: idSchema,
  kind: customerNoteKindSchema,
  body: trimmedText.min(1).max(MAX_CUSTOMER_NOTE_LENGTH),
  createdBy: idSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

/** `customerId` comes from the URL; the seller from the auth token. */
export const createCustomerNoteInputSchema = z.object({
  workspaceId: idSchema,
  kind: customerNoteKindSchema.default("note"),
  body: trimmedText.min(1).max(MAX_CUSTOMER_NOTE_LENGTH),
});

/**
 * Timeline events, newest first. Discriminated on `type`, so new kinds
 * (e.g. a future `conversation_message`) are added as new members.
 */
export const customerOrderStatusChangedEventSchema = z.object({
  type: z.literal("order_status_changed"),
  orderId: idSchema,
  /** Null on the initial draft-creation entry. */
  fromStatus: orderStatusSchema.nullable(),
  toStatus: orderStatusSchema,
  note: trimmedText.max(500).nullable(),
  at: isoDateTimeSchema,
});

export const customerNoteAddedEventSchema = z.object({
  type: z.literal("note_added"),
  noteId: idSchema,
  kind: customerNoteKindSchema,
  body: trimmedText.min(1).max(MAX_CUSTOMER_NOTE_LENGTH),
  at: isoDateTimeSchema,
});

export const customerTimelineEventSchema = z.discriminatedUnion("type", [
  customerOrderStatusChangedEventSchema,
  customerNoteAddedEventSchema,
]);

export const customerListItemSchema = customerSchema.extend({
  summary: customerSummarySchema,
  tags: z.array(customerTagSchema),
});

export const customerDetailSchema = customerListItemSchema.extend({
  /** Latest orders, newest first, at most `CUSTOMER_RECENT_ORDERS_LIMIT`. */
  recentOrders: z.array(orderListItemSchema).max(CUSTOMER_RECENT_ORDERS_LIMIT),
  /** Newest first. */
  notes: z.array(customerNoteSchema),
  /** Newest first, at most `CUSTOMER_TIMELINE_LIMIT`. */
  timeline: z.array(customerTimelineEventSchema).max(CUSTOMER_TIMELINE_LIMIT),
});

/**
 * `query` matches name, phone, city and email (case-insensitive substring); a
 * typed phone in any format also matches its normalised form. Several `tags`
 * narrow the result: a customer must have all of them.
 */
export const customerSearchQuerySchema = z.object({
  workspaceId: idSchema,
  query: trimmedText.min(1).max(120).optional(),
  tags: z.array(customerTagSchema).max(customerTagValues.length).optional(),
  sort: customerSortSchema.default("last_order_desc"),
  limit: z.int().min(1).max(100).default(25),
  cursor: trimmedText.min(1).max(500).optional(),
});

export type Customer = z.infer<typeof customerSchema>;
export type CustomerSummary = z.infer<typeof customerSummarySchema>;
export type CustomerNote = z.infer<typeof customerNoteSchema>;
export type CreateCustomerNoteInput = z.input<typeof createCustomerNoteInputSchema>;
export type ParsedCreateCustomerNoteInput = z.output<
  typeof createCustomerNoteInputSchema
>;
export type CustomerTimelineEvent = z.infer<typeof customerTimelineEventSchema>;
export type CustomerListItem = z.infer<typeof customerListItemSchema>;
export type CustomerDetail = z.infer<typeof customerDetailSchema>;
export type CustomerSearchQuery = z.input<typeof customerSearchQuerySchema>;
export type ParsedCustomerSearchQuery = z.output<typeof customerSearchQuerySchema>;
