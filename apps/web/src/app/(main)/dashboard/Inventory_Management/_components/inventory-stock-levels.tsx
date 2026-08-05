// inventory-stock-levels.tsx
"use client";

import { ArrowRight, Package, Store } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const stockData = [
  { product: "T-Shirt - L", sku: "TS-L-001", store1: 124, store2: 56, store3: 32 },
  { product: "Jeans - 32", sku: "JN-32-002", store1: 89, store2: 45, store3: 18 },
  { product: "Sneakers - 10", sku: "SN-10-003", store1: 45, store2: 23, store3: 67 },
  { product: "Jacket - M", sku: "JK-M-004", store1: 12, store2: 8, store3: 4 },
  { product: "Hat - One Size", sku: "HT-OS-005", store1: 234, store2: 178, store3: 92 },
  { product: "Scarf - Red", sku: "SC-R-006", store1: 56, store2: 34, store3: 21 },
];

const chartConfig = {
  store1: {
    label: "Main Store",
    color: "var(--chart-1)",
  },
  store2: {
    label: "Partner Store A",
    color: "var(--chart-2)",
  },
  store3: {
    label: "Partner Store B",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

function StockLevelIndicator({ level }: { level: number }) {
  let color = "bg-green-500";
  let label = "In Stock";
  if (level < 10) { color = "bg-destructive"; label = "Critical"; }
  else if (level < 25) { color = "bg-yellow-500"; label = "Low"; }
  
  return (
    <div className="flex items-center gap-1.5">
      <span className={`block size-2 rounded-full ${color}`} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export function InventoryStockLevels() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-sm">Stock Levels by Store</CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          View All Products <ArrowRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {stockData.map((item) => (
            <div key={item.sku} className="space-y-1.5 border-b pb-3 last:border-0 last:pb-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{item.product}</span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {item.sku}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <StockLevelIndicator level={Math.min(item.store1, item.store2, item.store3)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md bg-muted/50 p-1.5 text-center">
                  <div className="text-xs text-muted-foreground">Main</div>
                  <div className="font-semibold text-sm">{item.store1}</div>
                </div>
                <div className="rounded-md bg-muted/50 p-1.5 text-center">
                  <div className="text-xs text-muted-foreground">Partner A</div>
                  <div className="font-semibold text-sm">{item.store2}</div>
                </div>
                <div className="rounded-md bg-muted/50 p-1.5 text-center">
                  <div className="text-xs text-muted-foreground">Partner B</div>
                  <div className="font-semibold text-sm">{item.store3}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}