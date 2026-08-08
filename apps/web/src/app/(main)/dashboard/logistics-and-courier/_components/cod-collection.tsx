// cod-collection.tsx
"use client";

import { ArrowRight, DollarSign, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const codData = [
  { day: "Mon", amount: 4200, orders: 32 },
  { day: "Tue", amount: 3800, orders: 28 },
  { day: "Wed", amount: 5600, orders: 41 },
  { day: "Thu", amount: 4900, orders: 36 },
  { day: "Fri", amount: 6100, orders: 45 },
  { day: "Sat", amount: 3500, orders: 26 },
  { day: "Sun", amount: 2800, orders: 19 },
];

const chartConfig = {
  amount: {
    label: "COD Amount",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function CodCollection() {
  const totalCOD = codData.reduce((sum, d) => sum + d.amount, 0);
  const totalOrders = codData.reduce((sum, d) => sum + d.orders, 0);
  const avgOrderValue = totalCOD / totalOrders;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <DollarSign className="size-4 text-muted-foreground" />
          COD Collection Overview
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          View Details <ArrowRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md bg-muted/50 p-2 text-center">
            <div className="text-xs text-muted-foreground">Total to Collect</div>
            <div className="font-semibold text-lg">${totalCOD.toLocaleString()}</div>
          </div>
          <div className="rounded-md bg-muted/50 p-2 text-center">
            <div className="text-xs text-muted-foreground">Pending Orders</div>
            <div className="font-semibold text-lg">{totalOrders}</div>
          </div>
          <div className="rounded-md bg-muted/50 p-2 text-center">
            <div className="text-xs text-muted-foreground">Avg. Order Value</div>
            <div className="font-semibold text-lg">${avgOrderValue.toFixed(2)}</div>
          </div>
        </div>

        <ChartContainer config={chartConfig} className="h-40 w-full">
          <BarChart data={codData} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="4 4" />
            <XAxis dataKey="day" axisLine={false} tickLine={false} tickMargin={8} tick={{ fontSize: 10 }} />
            <YAxis axisLine={false} tickLine={false} tickMargin={8} tick={{ fontSize: 10 }} />
            <ChartTooltip content={<ChartTooltipContent labelFormatter={(label) => `${label}`} />} />
            <Bar dataKey="amount" fill="var(--color-amount)" radius={4} />
          </BarChart>
        </ChartContainer>
        
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-3 text-green-500" />
            <span className="text-muted-foreground">Peak collection on Friday</span>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {totalOrders} pending orders
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}