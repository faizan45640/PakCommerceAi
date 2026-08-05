// best-selling-products.tsx
"use client";

import { ArrowRight, Package, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const topProducts = [
  { name: "T-Shirt - Premium Cotton", sku: "TS-PC-001", unitsSold: 342, revenue: 8536.50, growth: 12.5 },
  { name: "Sneakers - Running Pro", sku: "SN-RP-002", unitsSold: 267, revenue: 12816.00, growth: 8.3 },
  { name: "Jeans - Slim Fit", sku: "JN-SF-003", unitsSold: 234, revenue: 11700.00, growth: -3.2 },
  { name: "Jacket - Winter Edition", sku: "JK-WE-004", unitsSold: 189, revenue: 10395.00, growth: 15.7 },
  { name: "Backpack - Classic", sku: "BP-CL-005", unitsSold: 156, revenue: 6240.00, growth: 5.9 },
];

function GrowthBadge({ growth }: { growth: number }) {
  return (
    <Badge 
      variant="secondary" 
      className={`rounded-md px-2 py-0.5 text-[10px] ${growth >= 0 ? 'bg-green-500/10 text-green-700 dark:text-green-300' : 'bg-destructive/10 text-destructive'}`}
    >
      {growth >= 0 ? '↑' : '↓'} {Math.abs(growth)}%
    </Badge>
  );
}

export function BestSellingProducts() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Star className="size-4 text-muted-foreground" />
          Best-Selling Products
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          View All <ArrowRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y divide-border">
          {topProducts.map((product, index) => (
            <div key={product.sku} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center size-7 rounded-full bg-primary/10 text-xs font-bold text-primary">
                  #{index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm leading-none">{product.name}</div>
                      <div className="text-muted-foreground text-xs font-mono mt-0.5">{product.sku}</div>
                    </div>
                    <GrowthBadge growth={product.growth} />
                  </div>
                  <div className="flex items-center justify-between mt-1.5 text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Package className="size-3" />
                      <span>{product.unitsSold} units</span>
                    </div>
                    <div className="font-semibold">${product.revenue.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}