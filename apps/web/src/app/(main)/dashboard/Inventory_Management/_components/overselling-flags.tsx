// overselling-flags.tsx
"use client";

import { ArrowRight, AlertCircle, ShoppingCart } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const oversellingItems = [
  { 
    product: "Sneakers - 10", 
    sku: "SN-10-003",
    store: "Marketplace X",
    ordered: 12,
    available: 8,
    deficit: 4,
    orderId: "ORD-2024-0042",
    customer: "James Wilson",
    status: "critical"
  },
  { 
    product: "Jacket - M", 
    sku: "JK-M-004",
    store: "Main Store",
    ordered: 7,
    available: 4,
    deficit: 3,
    orderId: "ORD-2024-0038",
    customer: "Sarah Chen",
    status: "warning"
  },
  { 
    product: "Jeans - 32", 
    sku: "JN-32-002",
    store: "Partner Store A",
    ordered: 5,
    available: 8,
    deficit: 0,
    orderId: "ORD-2024-0051",
    customer: "Mike Johnson",
    status: "resolved"
  },
];

function StatusBadge({ status }: { status: string }) {
  const config = {
    critical: { label: "Urgent - Oversold", className: "bg-destructive/10 border-destructive/50 text-destructive" },
    warning: { label: "Low Stock", className: "bg-yellow-500/10 border-yellow-600/50 text-yellow-700 dark:text-yellow-300" },
    resolved: { label: "Resolved", className: "bg-green-500/10 border-green-600/50 text-green-700 dark:text-green-300" },
  };
  
  const { label, className } = config[status as keyof typeof config] || config.resolved;
  
  return (
    <Badge variant="secondary" className={`rounded-md px-2.5 py-1 font-medium text-[10px] ${className}`}>
      {label}
    </Badge>
  );
}

export function OversellingFlags() {
  return (
    <Card className="border-destructive/20">
      <CardHeader className="bg-destructive/5 border-b border-destructive/20">
        <CardTitle className="flex items-center gap-2 text-sm">
          <AlertCircle className="size-4 text-destructive" />
          Overselling Flags
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          View All Orders <ArrowRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {oversellingItems.map((item) => (
            <div key={`${item.sku}-${item.orderId}`} className="flex flex-col gap-2 border-b pb-3 last:border-0 last:pb-0">
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="size-3 text-muted-foreground" />
                    <span className="font-medium text-sm">{item.product}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">{item.sku}</span>
                    <span>•</span>
                    <span>{item.store}</span>
                    <span>•</span>
                    <span>Order #{item.orderId}</span>
                  </div>
                </div>
                <StatusBadge status={item.status} />
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Ordered:</span>
                  <span className="ml-1 font-medium">{item.ordered}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Available:</span>
                  <span className={`ml-1 font-medium ${item.deficit > 0 ? "text-destructive" : "text-green-600"}`}>
                    {item.available}
                  </span>
                </div>
                {item.deficit > 0 && (
                  <div>
                    <span className="text-muted-foreground">Deficit:</span>
                    <span className="ml-1 font-medium text-destructive">-{item.deficit}</span>
                  </div>
                )}
                <div className="text-muted-foreground text-[10px]">
                  Customer: {item.customer}
                </div>
              </div>
            </div>
          ))}
          <Button size="sm" variant="outline" className="w-full text-xs border-destructive/30 text-destructive hover:bg-destructive/10">
            Review All Overselling Issues
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}