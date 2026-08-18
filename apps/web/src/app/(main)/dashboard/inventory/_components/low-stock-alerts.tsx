// low-stock-alerts.tsx
"use client";

import { AlertTriangle, ArrowRight, PackageOpen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const lowStockItems = [
  { product: "Jacket - M", sku: "JK-M-004", store: "Main Store", stock: 4, threshold: 10, channel: "Online" },
  { product: "Sneakers - 10", sku: "SN-10-003", store: "Partner Store B", stock: 3, threshold: 15, channel: "Retail" },
  { product: "Jeans - 32", sku: "JN-32-002", store: "Partner Store A", stock: 8, threshold: 12, channel: "Online" },
  { product: "Scarf - Red", sku: "SC-R-006", store: "Main Store", stock: 2, threshold: 5, channel: "Retail" },
  { product: "T-Shirt - XL", sku: "TS-XL-007", store: "Partner Store C", stock: 7, threshold: 10, channel: "Both" },
];

function StockLevelBar({ stock, threshold }: { stock: number; threshold: number }) {
  const percentage = Math.min((stock / threshold) * 100, 100);
  const color = percentage < 30 ? "bg-destructive" : percentage < 60 ? "bg-yellow-500" : "bg-green-500";
  
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${color}`} style={{ width: `${percentage}%` }} />
      </div>
      <span className="text-xs font-medium">{stock} / {threshold}</span>
    </div>
  );
}

export function LowStockAlerts() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <AlertTriangle className="size-4 text-yellow-500" />
          Low Stock Alerts
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          View All <ArrowRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {lowStockItems.map((item) => (
          <div key={`${item.sku}-${item.store}`} className="flex flex-col gap-1.5 border-b pb-3 last:border-0 last:pb-0">
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-sm leading-none">{item.product}</span>
                <Badge variant="outline" className="w-fit text-[10px] font-mono">{item.sku}</Badge>
              </div>
              <Badge variant="secondary" className="rounded-md px-2.5 py-1 text-[10px]">
                {item.channel}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PackageOpen className="size-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{item.store}</span>
              </div>
              <StockLevelBar stock={item.stock} threshold={item.threshold} />
            </div>
          </div>
        ))}
        <Button variant="outline" size="sm" className="w-full text-xs">
          Reorder All Low Stock Items
        </Button>
      </CardContent>
    </Card>
  );
}