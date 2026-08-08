// stock-history.tsx
"use client";

import { ArrowRight, TrendingDown } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const stockHistoryData = [
  { date: "Jan 1", stock: 150 },
  { date: "Jan 5", stock: 142 },
  { date: "Jan 10", stock: 138 },
  { date: "Jan 15", stock: 130 },
  { date: "Jan 20", stock: 118 },
  { date: "Jan 25", stock: 105 },
  { date: "Jan 30", stock: 95 },
  { date: "Feb 1", stock: 87 },
  { date: "Feb 5", stock: 78 },
  { date: "Feb 10", stock: 72 },
  { date: "Feb 15", stock: 65 },
  { date: "Feb 20", stock: 58 },
  { date: "Feb 25", stock: 52 },
  { date: "Mar 1", stock: 45 },
];

const productHistory = {
  name: "Jacket - M",
  sku: "JK-M-004",
  currentStock: 45,
  averageDailySales: 3.2,
  daysUntilOut: 14,
};

const chartConfig = {
  stock: {
    label: "Stock Level",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function StockHistory() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Stock History - {productHistory.name}</CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          View All Products <ArrowRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="rounded-md bg-muted/50 p-2 text-center">
            <div className="text-xs text-muted-foreground">Current Stock</div>
            <div className="font-semibold text-lg">{productHistory.currentStock}</div>
          </div>
          <div className="rounded-md bg-muted/50 p-2 text-center">
            <div className="text-xs text-muted-foreground">Avg. Daily Sales</div>
            <div className="font-semibold text-lg">{productHistory.averageDailySales}</div>
          </div>
          <div className="rounded-md bg-muted/50 p-2 text-center">
            <div className="text-xs text-muted-foreground">Days Until Out</div>
            <div className={`font-semibold text-lg ${productHistory.daysUntilOut < 20 ? "text-destructive" : "text-green-600"}`}>
              {productHistory.daysUntilOut}
            </div>
          </div>
        </div>
        
        <ChartContainer config={chartConfig} className="h-40 w-full">
          <AreaChart data={stockHistoryData} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="stockGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-stock)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-stock)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="4 4" />
            <XAxis dataKey="date" axisLine={false} tickLine={false} tickMargin={8} tick={{ fontSize: 10 }} />
            <YAxis axisLine={false} tickLine={false} tickMargin={8} tick={{ fontSize: 10 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area 
              dataKey="stock" 
              type="monotone" 
              stroke="var(--color-stock)" 
              fill="url(#stockGradient)" 
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
        
        <div className="mt-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <TrendingDown className="size-3 text-destructive" />
            <span className="text-muted-foreground">Decreasing trend</span>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono">
            {productHistory.sku}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}