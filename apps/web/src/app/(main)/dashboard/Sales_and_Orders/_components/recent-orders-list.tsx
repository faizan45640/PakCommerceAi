// recent-orders-list.tsx
"use client";

import { ArrowRight, ShoppingBag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const recentOrders = [
  {
    id: "ORD-2024-0092",
    customer: "Priya Patel",
    channel: "Shopify",
    amount: 234.50,
    status: "Delivered",
    time: "10 mins ago",
  },
  {
    id: "ORD-2024-0091",
    customer: "Alex Turner",
    channel: "WhatsApp",
    amount: 78.90,
    status: "Shipped",
    time: "25 mins ago",
  },
  {
    id: "ORD-2024-0090",
    customer: "Maria Garcia",
    channel: "Daraz",
    amount: 156.75,
    status: "Confirmed",
    time: "1 hour ago",
  },
  {
    id: "ORD-2024-0089",
    customer: "Tom Harris",
    channel: "Shopify",
    amount: 312.00,
    status: "Pending",
    time: "1.5 hours ago",
  },
  {
    id: "ORD-2024-0088",
    customer: "Nina Singh",
    channel: "WhatsApp",
    amount: 45.60,
    status: "Delivered",
    time: "2 hours ago",
  },
];

function OrderStatusBadge({ status }: { status: string }) {
  const config = {
    "Delivered": { className: "bg-green-500/10 border-green-600/50 text-green-700 dark:text-green-300" },
    "Shipped": { className: "bg-purple-500/10 border-purple-600/50 text-purple-700 dark:text-purple-300" },
    "Confirmed": { className: "bg-blue-500/10 border-blue-600/50 text-blue-700 dark:text-blue-300" },
    "Pending": { className: "bg-yellow-500/10 border-yellow-600/50 text-yellow-700 dark:text-yellow-300" },
  };
  
  const { className } = config[status as keyof typeof config] || config.Pending;
  
  return (
    <Badge variant="secondary" className={`rounded-md px-2.5 py-1 font-medium text-[10px] ${className}`}>
      {status}
    </Badge>
  );
}

export function RecentOrdersList() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShoppingBag className="size-4 text-muted-foreground" />
          Recent Orders
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          View All Orders <ArrowRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y divide-border">
          {recentOrders.map((order) => (
            <div key={order.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{order.id}</span>
                  <OrderStatusBadge status={order.status} />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <span>{order.customer}</span>
                  <span>•</span>
                  <span>{order.channel}</span>
                  <span>•</span>
                  <span>{order.time}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-sm">${order.amount.toFixed(2)}</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}