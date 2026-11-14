import type { Database } from "@pakcommerce/integrations/supabase";
import type {
  Order,
  OrderChannel,
  OrderDetail,
  OrderItem,
  OrderListItem,
  OrderPaymentMethod,
  OrderStatus,
  OrderStatusHistory,
  OrderStockCheck,
} from "@pakcommerce/shared";

/**
 * Translates order rows into the shared order contract.
 *
 * Storage is flat and snake_case; the contract is nested camelCase with money
 * as `{ amountMinor, currency }`. Translation lives here in pure functions so
 * it can be tested without a database.
 */

export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];
export type OrderStatusHistoryRow =
  Database["public"]["Tables"]["order_status_history"]["Row"];

/** The variant columns the confirm function reads to decide stock. */
export interface VariantStockRow {
  id: string;
  track_inventory: boolean;
  quantity_on_hand: number | null;
  reserved_quantity: number;
}

export function toOrderItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id,
    variantId: row.variant_id,
    title: row.title,
    variantTitle: row.variant_title,
    sku: row.sku,
    quantity: row.quantity,
    unitPrice: {
      amountMinor: row.unit_price_amount_minor,
      currency: row.currency as "PKR",
    },
    lineTotal: {
      amountMinor: row.line_total_amount_minor,
      currency: row.currency as "PKR",
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toOrderStatusHistory(row: OrderStatusHistoryRow): OrderStatusHistory {
  return {
    id: row.id,
    orderId: row.order_id,
    sellerId: row.seller_id,
    workspaceId: row.workspace_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    performedBy: row.performed_by,
    note: row.note,
    createdAt: row.created_at,
  };
}

export function toOrder(row: OrderRow, itemRows: OrderItemRow[]): Order {
  return {
    id: row.id,
    sellerId: row.seller_id,
    workspaceId: row.workspace_id,
    customerId: row.customer_id,
    status: row.status as OrderStatus,
    channel: row.channel as OrderChannel,
    paymentMethod: row.payment_method as OrderPaymentMethod,
    customer: {
      name: row.customer_name,
      phone: row.customer_phone,
      city: row.customer_city,
      email: row.customer_email,
      addressLine: row.customer_address_line,
    },
    items: itemRows.map(toOrderItem),
    subtotal: {
      amountMinor: row.subtotal_amount_minor,
      currency: row.currency as "PKR",
    },
    shippingFee: {
      amountMinor: row.shipping_fee_amount_minor,
      currency: row.currency as "PKR",
    },
    total: {
      amountMinor: row.total_amount_minor,
      currency: row.currency as "PKR",
    },
    currency: row.currency as "PKR",
    note: row.note,
    confirmedAt: row.confirmed_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toOrderListItem(
  row: OrderRow,
  itemCount: number,
): OrderListItem {
  return {
    id: row.id,
    sellerId: row.seller_id,
    workspaceId: row.workspace_id,
    customerId: row.customer_id,
    status: row.status as OrderStatus,
    channel: row.channel as OrderChannel,
    paymentMethod: row.payment_method as OrderPaymentMethod,
    total: {
      amountMinor: row.total_amount_minor,
      currency: row.currency as "PKR",
    },
    currency: row.currency as "PKR",
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerCity: row.customer_city,
    itemCount,
  };
}

/**
 * Stock checks for a draft order. Same rule as `transition_order_status`:
 * - quantities are summed per variant (two lines of one SKU share one check),
 * - a variant that is untracked (`track_inventory` false or `quantity_on_hand`
 *   null) is skipped by confirm, so it is sufficient with `available: null`,
 * - otherwise available = on_hand - reserved, and it is insufficient when
 *   available < needed.
 * A variant row that cannot be read is reported insufficient with available 0
 * (confirm raises `variant_not_found` for it).
 */
export function toStockChecks(
  items: OrderItem[],
  variantRows: VariantStockRow[],
): OrderStockCheck[] {
  const neededByVariant = new Map<string, number>();
  for (const item of items) {
    neededByVariant.set(
      item.variantId,
      (neededByVariant.get(item.variantId) ?? 0) + item.quantity,
    );
  }
  const variants = new Map(variantRows.map((row) => [row.id, row]));

  return items.map((item) => {
    const needed = neededByVariant.get(item.variantId) ?? item.quantity;
    const variant = variants.get(item.variantId);
    const base = {
      variantId: item.variantId,
      productId: item.productId,
      title: item.title,
      variantTitle: item.variantTitle ?? null,
      needed,
    };

    if (!variant) {
      return { ...base, available: 0, sufficient: false };
    }
    if (!variant.track_inventory || variant.quantity_on_hand === null) {
      return { ...base, available: null, sufficient: true };
    }

    const available = variant.quantity_on_hand - variant.reserved_quantity;
    return { ...base, available, sufficient: available >= needed };
  });
}

export function toOrderDetail(
  order: Order,
  history: OrderStatusHistory[],
  stockChecks: OrderStockCheck[],
): OrderDetail {
  return { ...order, statusHistory: history, stockChecks };
}
