import type {
  ApiMeta,
  Order,
  OrderListItem,
  OrderStatus,
  ParsedCreateDraftOrderInput,
  ParsedOrderSearchQuery,
} from "@pakcommerce/shared";

import { NotFoundError, ValidationError } from "../lib/http-errors.js";
import { decodePageCursor, encodePageCursor } from "../lib/page-cursor.js";
import type { SellerContext } from "../middleware/seller-context.js";
import {
  toOrder,
  toOrderListItem,
  type OrderItemRow,
  type OrderRow,
} from "./order-mapper.js";

/**
 * Draft/manual orders + confirm/cancel transitions.
 *
 * Every query goes through `auth.db` (seller token), so RLS scopes rows inside
 * Postgres. Create goes through `create_draft_order`; status changes go through
 * `transition_order_status` (confirm deducts stock with a sale movement).
 */

interface ResolvedLineItem {
  variantId: string;
  productId: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  unitPriceAmountMinor: number;
  currency: string;
  quantity: number;
}

export async function createDraftOrder(
  auth: SellerContext,
  input: ParsedCreateDraftOrderInput,
): Promise<Order> {
  const lines = await resolveLineItems(auth, input);

  const shippingFee = input.shippingFee?.amountMinor ?? 0;
  const currency = (input.shippingFee?.currency ?? lines[0]?.currency ?? "PKR") as string;
  const subtotal = lines.reduce(
    (sum, line) => sum + line.unitPriceAmountMinor * line.quantity,
    0,
  );
  const total = subtotal + shippingFee;

  const payload = {
    workspace_id: input.workspaceId,
    seller_id: auth.sellerId,
    channel: input.channel,
    payment_method: input.paymentMethod,
    customer_name: input.customer.name,
    customer_phone: input.customer.phone,
    customer_city: input.customer.city,
    customer_email: input.customer.email ?? null,
    customer_address_line: input.customer.addressLine ?? null,
    shipping_fee_amount_minor: shippingFee,
    subtotal_amount_minor: subtotal,
    total_amount_minor: total,
    currency,
    note: input.note ?? null,
    performed_by: auth.sellerId,
    items: lines.map((line) => ({
      product_id: line.productId,
      variant_id: line.variantId,
      title: line.title,
      variant_title: line.variantTitle,
      sku: line.sku,
      quantity: line.quantity,
      unit_price_amount_minor: line.unitPriceAmountMinor,
      line_total_amount_minor: line.unitPriceAmountMinor * line.quantity,
      currency: line.currency,
    })),
  };

  const { data: orderId, error } = await auth.db.rpc("create_draft_order", {
    payload,
  });

  if (error) throw translateCreateError(error);

  return getOrder(auth, input.workspaceId, orderId as string);
}

export async function transitionOrderStatus(
  auth: SellerContext,
  workspaceId: string,
  orderId: string,
  toStatus: OrderStatus,
  note?: string | null,
): Promise<Order> {
  const { error } = await auth.db.rpc("transition_order_status", {
    p_order_id: orderId,
    p_workspace_id: workspaceId,
    p_to_status: toStatus,
    ...(note == null ? {} : { p_note: note }),
  });

  if (error) throw translateTransitionError(error);

  return getOrder(auth, workspaceId, orderId);
}

export async function getOrder(
  auth: SellerContext,
  workspaceId: string,
  orderId: string,
): Promise<Order> {
  const { data: order, error: orderError } = await auth.db
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (orderError) throw new Error(orderError.message, { cause: orderError });
  if (!order) throw new NotFoundError("Order not found.");

  const { data: items, error: itemsError } = await auth.db
    .from("order_items")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (itemsError) throw new Error(itemsError.message, { cause: itemsError });

  return toOrder(order as OrderRow, (items ?? []) as OrderItemRow[]);
}

export async function listOrders(
  auth: SellerContext,
  query: ParsedOrderSearchQuery,
): Promise<{ items: OrderListItem[]; meta: ApiMeta; nextCursor: string | null }> {
  const page = decodePageCursor(query.cursor);
  const offset = (page - 1) * query.limit;

  let builder = auth.db
    .from("orders")
    .select("*, order_items(count)", { count: "exact" })
    .eq("workspace_id", query.workspaceId);

  if (query.statuses?.length) builder = builder.in("status", query.statuses);
  if (query.channels?.length) builder = builder.in("channel", query.channels);
  if (query.query) {
    // PostgREST filter values: quote and escape so commas/periods in the
    // search term cannot break or rewrite the .or() predicate.
    const term = `"%${escapePostgrestFilterValue(query.query)}%"`;
    builder = builder.or(
      `customer_name.ilike.${term},customer_phone.ilike.${term},customer_city.ilike.${term}`,
    );
  }

  builder = applyOrderSort(builder, query.sort);

  const { data, count, error } = await builder.range(
    offset,
    offset + query.limit - 1,
  );

  if (error) throw new Error(error.message, { cause: error });

  const total = count ?? 0;
  const rows = data ?? [];

  return {
    items: rows.map((row) => {
      const itemCountRaw = (row as { order_items?: { count: number }[] }).order_items;
      const itemCount = Array.isArray(itemCountRaw)
        ? (itemCountRaw[0]?.count ?? 0)
        : 0;
      // Strip the nested aggregate before mapping.
      const { order_items: _ignored, ...orderRow } = row as OrderRow & {
        order_items?: unknown;
      };
      return toOrderListItem(orderRow as OrderRow, itemCount);
    }),
    meta: { page, pageSize: query.limit, total },
    nextCursor: offset + rows.length < total ? encodePageCursor(page + 1) : null,
  };
}

async function resolveLineItems(
  auth: SellerContext,
  input: ParsedCreateDraftOrderInput,
): Promise<ResolvedLineItem[]> {
  const resolved: ResolvedLineItem[] = [];

  for (const [index, item] of input.items.entries()) {
    const { data: variant, error } = await auth.db
      .from("product_variants")
      .select(
        "id, product_id, workspace_id, title, sku, price_amount_minor, price_currency, products!inner(title)",
      )
      .eq("id", item.variantId)
      .eq("workspace_id", input.workspaceId)
      .maybeSingle();

    if (error) throw new Error(error.message, { cause: error });
    if (!variant) {
      throw new ValidationError("One or more line items are invalid.", {
        [`items.${index}.variantId`]: ["Variant not found in this workspace."],
      });
    }

    if (variant.product_id !== item.productId) {
      throw new ValidationError("One or more line items are invalid.", {
        [`items.${index}.productId`]: [
          "productId does not match the variant's product.",
        ],
      });
    }

    const productRelation = variant.products as
      | { title?: string }
      | { title?: string }[]
      | null;
    const productTitle = Array.isArray(productRelation)
      ? (productRelation[0]?.title ?? "Product")
      : (productRelation?.title ?? "Product");
    const unitPriceAmountMinor =
      item.unitPrice?.amountMinor ?? variant.price_amount_minor;
    const currency = item.unitPrice?.currency ?? variant.price_currency ?? "PKR";

    resolved.push({
      variantId: variant.id,
      productId: variant.product_id,
      sku: item.sku === undefined ? variant.sku : item.sku,
      unitPriceAmountMinor,
      currency,
      quantity: item.quantity,
      title: item.title ?? productTitle,
      variantTitle:
        item.variantTitle === undefined ? variant.title : item.variantTitle,
    });
  }

  return resolved;
}

function applyOrderSort(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  builder: any,
  sort: ParsedOrderSearchQuery["sort"],
) {
  switch (sort) {
    case "newest":
      return builder
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });
    case "total_desc":
      return builder
        .order("total_amount_minor", { ascending: false })
        .order("id", { ascending: true });
    case "total_asc":
      return builder
        .order("total_amount_minor", { ascending: true })
        .order("id", { ascending: true });
    case "updated_desc":
    default:
      return builder
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true });
  }
}

function escapePostgrestFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function translateCreateError(error: { message: string }) {
  if (/at least one item/i.test(error.message)) {
    return new ValidationError("A draft order must have at least one item.", {
      items: ["Add at least one line item."],
    });
  }
  if (/row-level security/i.test(error.message)) {
    return new NotFoundError("Workspace not found.");
  }
  return new Error(error.message, { cause: error });
}

function translateTransitionError(error: {
  message: string;
  details?: string;
  code?: string;
}) {
  const token = error.message.trim();

  switch (token) {
    case "order not found":
      return new NotFoundError("Order not found.");
    case "address_required":
      return new ValidationError("A delivery address is required to confirm.", {
        "customer.addressLine": ["Add a delivery address before confirming."],
      });
    case "insufficient_stock": {
      const [variantId, available, needed] = (error.details ?? "").split(":");
      return new ValidationError("Not enough stock to confirm this order.", {
        items: [
          variantId
            ? `Variant ${variantId} has ${available ?? "?"} available; ${needed ?? "?"} needed.`
            : "One or more variants do not have enough available stock.",
        ],
      });
    }
    case "stock_negative":
      return new ValidationError("Stock cannot go below zero.", {
        items: ["Confirming would drive stock below zero."],
      });
    case "stock_below_reserved":
      return new ValidationError("Stock cannot go below what is already reserved.", {
        items: [
          `${error.details ?? "Some"} units are reserved for other orders.`,
        ],
      });
    case "variant_not_found":
      return new ValidationError("A line item variant is no longer available.", {
        items: ["One or more variants were not found in this workspace."],
      });
    default:
      break;
  }

  if (/illegal order status transition/i.test(token)) {
    return new ValidationError("That status change is not allowed.", {
      toStatus: [token],
    });
  }
  if (/only draft → cancelled\|confirmed/i.test(token) || /fulfillment transitions/i.test(token)) {
    return new ValidationError("That status change is not enabled yet.", {
      toStatus: [token],
    });
  }
  if (/no_data_found|PGRST116/i.test(error.code ?? "") || /order not found/i.test(token)) {
    return new NotFoundError("Order not found.");
  }

  return new Error(error.message, { cause: error });
}
