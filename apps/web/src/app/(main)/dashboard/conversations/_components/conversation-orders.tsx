"use client";

import * as React from "react";
import Link from "next/link";
import type { Conversation } from "@pakcommerce/shared/conversations";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchOrders, type OrderListItemWithAi } from "@/lib/api/orders";
import { fetchCurrentWorkspace } from "@/lib/api/products";
import { formatPkr } from "@/lib/currency";

import { OrderCreatedViaBadge } from "../../orders/_components/order-ai-badge";
import { OrderStatusBadge, shortOrderId } from "../../orders/_components/order-badges";
import { ordersRefreshKey } from "./conversation-orders-model";

type Loaded = { key: string; orders: OrderListItemWithAi[] } | { key: string; error: true };

/** "Orders from this chat", shown beside the thread. Reloads when the thread or its state changes. */
export function ConversationOrders({
  conversationId,
  updatedConversation,
  refreshTick = 0,
}: {
  conversationId?: string;
  updatedConversation?: Conversation | null;
  refreshTick?: number;
}) {
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);
  const key = conversationId ? `${conversationId}|${ordersRefreshKey(refreshTick, updatedConversation, conversationId)}` : "";

  React.useEffect(() => {
    if (!conversationId) return;
    let ignore = false;
    (async () => {
      try {
        const workspace = await fetchCurrentWorkspace();
        const result = await fetchOrders({ workspaceId: workspace.id, conversationId, sort: "newest", limit: 20 });
        if (!ignore) setLoaded({ key, orders: result.items });
      } catch {
        if (!ignore) setLoaded({ key, error: true });
      }
    })();
    return () => {
      ignore = true;
    };
    // `key` carries every refresh trigger.
  }, [conversationId, key]);

  if (!conversationId) return null;

  // Keep showing the previous list while a quiet refresh runs for the same chat.
  const current = loaded && loaded.key.startsWith(`${conversationId}|`) ? loaded : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Orders from this chat</CardTitle>
      </CardHeader>
      <CardContent>
        {!current ? (
          <p className="text-muted-foreground text-sm">Loading orders…</p>
        ) : "error" in current ? (
          <p className="text-destructive text-sm">Could not load orders.</p>
        ) : current.orders.length === 0 ? (
          <p className="text-muted-foreground text-sm">No orders from this chat yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {current.orders.map((order) => (
              <li key={order.id} className="flex flex-col gap-1 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/dashboard/orders/${order.id}`} className="font-medium hover:underline">
                    {shortOrderId(order.id)}
                  </Link>
                  <OrderStatusBadge status={order.status} />
                  <span className="text-muted-foreground">{formatPkr(order.total.amountMinor)}</span>
                </div>
                <OrderCreatedViaBadge createdVia={order.createdVia} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
