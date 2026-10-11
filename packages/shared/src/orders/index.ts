import { z } from "zod";

import { moneySchema } from "../products/index.js";

export const orderStatusValues = [
  "draft",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
] as const;

export const orderChannelValues = [
  "whatsapp",
  "shopify",
  "woocommerce",
  "instagram",
  "facebook",
  "manual",
] as const;

export const orderSortValues = [
  "newest",
  "updated_desc",
  "total_desc",
  "total_asc",
] as const;

/**
 * Closed transition map for the order lifecycle.
 * Terminal statuses (`cancelled`, `returned`) have empty allow-lists.
 */
export const ORDER_STATUS_TRANSITIONS = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered", "returned"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
} as const satisfies Record<
  (typeof orderStatusValues)[number],
  readonly (typeof orderStatusValues)[number][]
>;

export const orderContractVersion = "2026-10-11";

const idSchema = z.uuid();
const trimmedText = z.string().trim();
const nullableText = trimmedText.nullable();
const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const orderStatusSchema = z.enum(orderStatusValues);
export const orderChannelSchema = z.enum(orderChannelValues);
export const orderSortSchema = z.enum(orderSortValues);

export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type OrderChannel = z.infer<typeof orderChannelSchema>;

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  if (from === to) {
    return false;
  }

  const allowed = ORDER_STATUS_TRANSITIONS[from] as readonly OrderStatus[];
  return allowed.includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal order status transition: ${from} → ${to}`);
  }
}

export const orderCustomerSnapshotSchema = z.object({
  name: trimmedText.min(1).max(160),
  phone: trimmedText.min(5).max(32),
  city: trimmedText.min(1).max(80),
  email: z.email().nullable().optional(),
  addressLine: trimmedText.max(300).nullable().optional(),
});

/**
 * The unrefined object shape.
 *
 * Zod 4 refuses `.pick()` / `.omit()` on a schema carrying refinements, so the
 * refinement is applied to derived schemas rather than baked into the base.
 * Keep this internal — `orderItemSchema` is the public contract.
 */
const orderItemBaseSchema = z.object({
  id: idSchema,
  orderId: idSchema,
  productId: idSchema,
  variantId: idSchema,
  title: trimmedText.min(1).max(180),
  variantTitle: trimmedText.min(1).max(160).nullable().optional(),
  sku: nullableText.optional(),
  quantity: z.int().positive(),
  unitPrice: moneySchema,
  lineTotal: moneySchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

function assertLineTotalMatchesUnitPrice(
  item: {
    quantity: number;
    unitPrice: { amountMinor: number; currency: string };
    lineTotal: { amountMinor: number; currency: string };
  },
  context: z.RefinementCtx,
) {
  if (item.unitPrice.currency !== item.lineTotal.currency) {
    context.addIssue({
      code: "custom",
      path: ["lineTotal", "currency"],
      message: "Line total currency must match unit price currency.",
    });
  }

  const expected = item.quantity * item.unitPrice.amountMinor;
  if (item.lineTotal.amountMinor !== expected) {
    context.addIssue({
      code: "custom",
      path: ["lineTotal", "amountMinor"],
      message: "Line total must equal quantity times unit price.",
    });
  }
}

export const orderItemSchema = orderItemBaseSchema.superRefine(
  assertLineTotalMatchesUnitPrice,
);

const orderStatusHistoryBaseSchema = z.object({
  id: idSchema,
  orderId: idSchema,
  sellerId: idSchema,
  workspaceId: idSchema,
  fromStatus: orderStatusSchema.nullable(),
  toStatus: orderStatusSchema,
  performedBy: idSchema.nullable(),
  note: trimmedText.max(500).nullable(),
  createdAt: isoDateTimeSchema,
});

export const orderStatusHistorySchema = orderStatusHistoryBaseSchema.superRefine(
  (history, context) => {
    if (history.fromStatus === null) {
      if (history.toStatus !== "draft") {
        context.addIssue({
          code: "custom",
          path: ["toStatus"],
          message: "Initial status history entry must create a draft order.",
        });
      }
      return;
    }

    if (!canTransition(history.fromStatus, history.toStatus)) {
      context.addIssue({
        code: "custom",
        path: ["toStatus"],
        message: `Illegal order status transition: ${history.fromStatus} → ${history.toStatus}`,
      });
    }
  },
);

/**
 * The unrefined object shape.
 *
 * Zod 4 refuses `.pick()` / `.omit()` on a schema carrying refinements, so the
 * refinement is applied to derived schemas rather than baked into the base.
 * Keep this internal — `orderSchema` is the public contract.
 */
const orderBaseSchema = z.object({
  id: idSchema,
  sellerId: idSchema,
  workspaceId: idSchema,
  status: orderStatusSchema,
  channel: orderChannelSchema,
  customer: orderCustomerSnapshotSchema,
  items: z.array(orderItemSchema).min(1).max(200),
  subtotal: moneySchema,
  total: moneySchema,
  currency: z.literal("PKR").default("PKR"),
  note: trimmedText.max(1000).nullable().optional(),
  confirmedAt: isoDateTimeSchema.nullable(),
  cancelledAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

function assertOrderTotals(
  order: {
    items: {
      lineTotal: { amountMinor: number; currency: string };
    }[];
    subtotal: { amountMinor: number; currency: string };
    total: { amountMinor: number; currency: string };
    currency: string;
    status: OrderStatus;
    confirmedAt: string | null;
  },
  context: z.RefinementCtx,
) {
  const itemsSum = order.items.reduce(
    (sum, item) => sum + item.lineTotal.amountMinor,
    0,
  );

  if (order.subtotal.amountMinor !== itemsSum) {
    context.addIssue({
      code: "custom",
      path: ["subtotal", "amountMinor"],
      message: "Subtotal must equal the sum of line totals.",
    });
  }

  if (order.total.amountMinor !== order.subtotal.amountMinor) {
    context.addIssue({
      code: "custom",
      path: ["total", "amountMinor"],
      message:
        "Total must equal subtotal for MVP (no shipping/tax lines yet).",
    });
  }

  if (
    order.subtotal.currency !== order.currency ||
    order.total.currency !== order.currency
  ) {
    context.addIssue({
      code: "custom",
      path: ["currency"],
      message: "Order currency must match subtotal and total currency.",
    });
  }

  if (order.status === "draft" && order.confirmedAt !== null) {
    context.addIssue({
      code: "custom",
      path: ["confirmedAt"],
      message: "Draft orders must not have a confirmedAt timestamp.",
    });
  }

  const requiresConfirmStamp =
    order.status === "confirmed" ||
    order.status === "shipped" ||
    order.status === "delivered" ||
    order.status === "returned";

  if (requiresConfirmStamp && order.confirmedAt === null) {
    context.addIssue({
      code: "custom",
      path: ["confirmedAt"],
      message: "Confirmed-path orders require a confirmedAt timestamp.",
    });
  }
}

export const orderSchema = orderBaseSchema.superRefine(assertOrderTotals);

export const createDraftOrderItemInputSchema = z.object({
  productId: idSchema,
  variantId: idSchema,
  quantity: z.int().positive(),
  unitPrice: moneySchema.optional(),
  title: trimmedText.min(1).max(180).optional(),
  variantTitle: trimmedText.min(1).max(160).nullable().optional(),
  sku: nullableText.optional(),
});

/**
 * Creates a draft order only. Callers cannot set status to confirmed here —
 * confirmation is a separate transition (T-037) so AI tools cannot skip HITL.
 */
export const createDraftOrderInputSchema = z.object({
  workspaceId: idSchema,
  channel: orderChannelSchema.default("manual"),
  customer: orderCustomerSnapshotSchema,
  items: z.array(createDraftOrderItemInputSchema).min(1).max(200),
  note: trimmedText.max(1000).nullable().optional(),
});

export const transitionOrderStatusInputSchema = z
  .object({
    workspaceId: idSchema,
    orderId: idSchema,
    toStatus: orderStatusSchema,
    note: trimmedText.max(500).nullable().optional(),
  })
  .superRefine((input, context) => {
    if (input.toStatus === "draft") {
      context.addIssue({
        code: "custom",
        path: ["toStatus"],
        message: "Cannot transition an order back to draft.",
      });
    }
  });

export const orderSearchQuerySchema = z.object({
  workspaceId: idSchema,
  query: trimmedText.min(1).max(120).optional(),
  statuses: z
    .array(orderStatusSchema)
    .max(orderStatusValues.length)
    .optional(),
  channels: z
    .array(orderChannelSchema)
    .max(orderChannelValues.length)
    .optional(),
  sort: orderSortSchema.default("updated_desc"),
  limit: z.int().min(1).max(100).default(25),
  cursor: trimmedText.min(1).max(500).optional(),
});

export const orderListItemSchema = orderBaseSchema
  .pick({
    id: true,
    sellerId: true,
    workspaceId: true,
    status: true,
    channel: true,
    total: true,
    currency: true,
    confirmedAt: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    customerName: trimmedText.min(1).max(160),
    customerPhone: trimmedText.min(5).max(32),
    customerCity: trimmedText.min(1).max(80),
    itemCount: z.int().nonnegative(),
  });

export type OrderCustomerSnapshot = z.infer<typeof orderCustomerSnapshotSchema>;
export type OrderItem = z.infer<typeof orderItemSchema>;
export type OrderStatusHistory = z.infer<typeof orderStatusHistorySchema>;
export type Order = z.infer<typeof orderSchema>;
export type OrderSort = z.infer<typeof orderSortSchema>;
export type CreateDraftOrderItemInput = z.input<
  typeof createDraftOrderItemInputSchema
>;
export type CreateDraftOrderInput = z.input<typeof createDraftOrderInputSchema>;
export type ParsedCreateDraftOrderInput = z.output<
  typeof createDraftOrderInputSchema
>;
export type TransitionOrderStatusInput = z.input<
  typeof transitionOrderStatusInputSchema
>;
export type ParsedTransitionOrderStatusInput = z.output<
  typeof transitionOrderStatusInputSchema
>;
export type OrderSearchQuery = z.input<typeof orderSearchQuerySchema>;
export type ParsedOrderSearchQuery = z.output<typeof orderSearchQuerySchema>;
export type OrderListItem = z.infer<typeof orderListItemSchema>;
