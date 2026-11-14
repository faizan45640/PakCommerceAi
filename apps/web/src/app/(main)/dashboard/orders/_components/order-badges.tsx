import type { OrderChannel, OrderStatus } from "@pakcommerce/shared";

import { Badge } from "@/components/ui/badge";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

export const ORDER_CHANNEL_LABELS: Record<OrderChannel, string> = {
  whatsapp: "WhatsApp",
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  instagram: "Instagram",
  facebook: "Facebook",
  manual: "Manual",
};

const STATUS_CLASSES: Record<OrderStatus, string> = {
  draft: "bg-yellow-500/10 border-yellow-600/50 text-yellow-700 dark:text-yellow-300",
  confirmed: "bg-blue-500/10 border-blue-600/50 text-blue-700 dark:text-blue-300",
  shipped: "bg-purple-500/10 border-purple-600/50 text-purple-700 dark:text-purple-300",
  delivered: "bg-green-500/10 border-green-600/50 text-green-700 dark:text-green-300",
  cancelled: "bg-destructive/10 border-destructive/50 text-destructive",
  returned: "bg-orange-500/10 border-orange-600/50 text-orange-700 dark:text-orange-300",
};

const CHANNEL_CLASSES: Record<OrderChannel, string> = {
  shopify: "bg-green-500/10 text-green-700 dark:text-green-300",
  whatsapp: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  woocommerce: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  instagram: "bg-pink-500/10 text-pink-700 dark:text-pink-300",
  facebook: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  manual: "bg-gray-500/10 text-gray-700 dark:text-gray-300",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant="secondary" className={`rounded-md px-2.5 py-1 font-medium text-[10px] ${STATUS_CLASSES[status]}`}>
      {ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}

export function OrderChannelBadge({ channel }: { channel: OrderChannel }) {
  return (
    <Badge variant="secondary" className={`rounded-md px-2.5 py-1 font-medium text-[10px] ${CHANNEL_CLASSES[channel]}`}>
      {ORDER_CHANNEL_LABELS[channel]}
    </Badge>
  );
}

/** "a1b2c3d4" from a full uuid; used wherever an order id is shown. */
export function shortOrderId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}
