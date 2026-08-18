// draft-orders-queue.tsx
"use client";

import { ArrowRight, CheckCircle, Clock, Edit, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const draftOrders = [
  {
    id: "DRAFT-2024-0042",
    customer: "Priya Patel",
    product: "Premium T-Shirt - L",
    quantity: 2,
    amount: 124.50,
    channel: "WhatsApp",
    time: "5 mins ago",
    confidence: 92,
  },
  {
    id: "DRAFT-2024-0041",
    customer: "Alex Turner",
    product: "Running Sneakers - 10",
    quantity: 1,
    amount: 89.99,
    channel: "WhatsApp",
    time: "12 mins ago",
    confidence: 78,
  },
  {
    id: "DRAFT-2024-0040",
    customer: "Maria Garcia",
    product: "Winter Jacket - M",
    quantity: 3,
    amount: 256.75,
    channel: "Instagram",
    time: "25 mins ago",
    confidence: 65,
  },
  {
    id: "DRAFT-2024-0039",
    customer: "Tom Harris",
    product: "Slim Fit Jeans - 32",
    quantity: 4,
    amount: 312.00,
    channel: "WhatsApp",
    time: "1 hour ago",
    confidence: 88,
  },
];

function ConfidenceIndicator({ confidence }: { confidence: number }) {
  const color = confidence >= 80 ? "bg-green-500" : confidence >= 60 ? "bg-yellow-500" : "bg-destructive";
  
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${confidence}%` }} />
      </div>
      <span className="text-xs font-medium">{confidence}%</span>
    </div>
  );
}

export function DraftOrdersQueue() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Clock className="size-4 text-muted-foreground" />
          Draft Orders Awaiting Approval
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          View All <ArrowRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{draftOrders.length} orders need review</span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            Sorted by oldest first
          </span>
        </div>

        <div className="flex flex-col divide-y divide-border">
          {draftOrders.map((order) => (
            <div key={order.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{order.id}</span>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {order.channel}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span>{order.customer}</span>
                    <span>•</span>
                    <span>{order.quantity}x {order.product}</span>
                    <span>•</span>
                    <span>{order.time}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-sm">${order.amount.toFixed(2)}</div>
                  <ConfidenceIndicator confidence={order.confidence} />
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" className="h-7 text-xs flex-1">
                  <CheckCircle className="size-3 mr-1" />
                  Approve
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs flex-1">
                  <Edit className="size-3 mr-1" />
                  Edit
                </Button>
                <Button size="sm" variant="destructive" className="h-7 text-xs">
                  <XCircle className="size-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}