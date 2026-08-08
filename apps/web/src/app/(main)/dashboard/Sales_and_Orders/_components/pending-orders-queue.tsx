// pending-orders-queue.tsx
"use client";

import { ArrowRight, Clock, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const pendingOrders = [
  {
    id: "ORD-2024-0082",
    customer: "James Wilson",
    channel: "WhatsApp",
    amount: 124.50,
    items: 3,
    time: "2 hours ago",
    priority: "High",
  },
  {
    id: "ORD-2024-0081",
    customer: "Sarah Chen",
    channel: "Shopify",
    amount: 89.99,
    items: 2,
    time: "3 hours ago",
    priority: "Medium",
  },
  {
    id: "ORD-2024-0080",
    customer: "Mike Johnson",
    channel: "Daraz",
    amount: 256.75,
    items: 4,
    time: "4 hours ago",
    priority: "High",
  },
  {
    id: "ORD-2024-0079",
    customer: "Emily Brown",
    channel: "WhatsApp",
    amount: 67.30,
    items: 1,
    time: "5 hours ago",
    priority: "Low",
  },
  {
    id: "ORD-2024-0078",
    customer: "David Kim",
    channel: "Shopify",
    amount: 189.99,
    items: 5,
    time: "6 hours ago",
    priority: "Medium",
  },
];

function PriorityBadge({ priority }: { priority: string }) {
  const config = {
    High: { className: "bg-destructive/10 border-destructive/50 text-destructive" },
    Medium: { className: "bg-yellow-500/10 border-yellow-600/50 text-yellow-700 dark:text-yellow-300" },
    Low: { className: "bg-green-500/10 border-green-600/50 text-green-700 dark:text-green-300" },
  };
  
  const { className } = config[priority as keyof typeof config] || config.Low;
  
  return (
    <Badge variant="secondary" className={`rounded-md px-2.5 py-1 font-medium text-[10px] ${className}`}>
      {priority}
    </Badge>
  );
}

export function PendingOrdersQueue() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Clock className="size-4 text-muted-foreground" />
          Pending Orders Queue
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          View All <ArrowRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Oldest first</span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {pendingOrders.length} orders awaiting confirmation
          </span>
        </div>

        <div className="flex flex-col divide-y divide-border">
          {pendingOrders.map((order) => (
            <div key={order.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{order.id}</span>
                    <PriorityBadge priority={order.priority} />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <User className="size-3" />
                    <span>{order.customer}</span>
                    <span>•</span>
                    <span>{order.channel}</span>
                    <span>•</span>
                    <span>{order.items} items</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-sm">${order.amount.toFixed(2)}</div>
                  <div className="text-muted-foreground text-xs">{order.time}</div>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" className="h-7 text-xs flex-1">
                  Confirm
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs flex-1">
                  Review
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}