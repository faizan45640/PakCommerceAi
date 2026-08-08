// rto-count.tsx
"use client";

import { ArrowRight, PackageX, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const rtoData = [
  { reason: "Customer Refused", count: 42, percentage: 27.1 },
  { reason: "Wrong Address", count: 38, percentage: 24.5 },
  { reason: "Delivery Failed", count: 31, percentage: 20.0 },
  { reason: "Unreachable", count: 25, percentage: 16.1 },
  { reason: "Damaged", count: 19, percentage: 12.3 },
];

const rtoTrendData = [
  { week: "Week 1", returns: 28 },
  { week: "Week 2", returns: 35 },
  { week: "Week 3", returns: 42 },
  { week: "Week 4", returns: 31 },
  { week: "Week 5", returns: 19 },
];

const chartConfig = {
  returns: {
    label: "RTO Orders",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

export function RtoCount() {
  const totalRTO = rtoData.reduce((sum, d) => sum + d.count, 0);
  const totalOrders = 1847;
  const rtoRate = (totalRTO / totalOrders * 100).toFixed(1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <PackageX className="size-4 text-destructive" />
          RTO Analysis
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          View Report <ArrowRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-semibold leading-none tracking-tight">{totalRTO}</div>
            <div className="text-muted-foreground text-xs">RTO Orders</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold leading-none tracking-tight">{rtoRate}%</div>
            <div className="text-muted-foreground text-xs">RTO Rate</div>
          </div>
          <Badge className="bg-destructive/10 text-destructive">
            <TrendingUp className="size-3" />
            2.1% increase
          </Badge>
        </div>

        <div className="space-y-2">
          {rtoData.map((item) => (
            <div key={item.reason} className="flex items-center gap-2">
              <div className="min-w-24 text-xs">{item.reason}</div>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div 
                  className="h-full rounded-full bg-destructive/70" 
                  style={{ width: `${item.percentage}%` }} 
                />
              </div>
              <div className="min-w-12 text-right text-xs font-medium">
                {item.count} ({item.percentage}%)
              </div>
            </div>
          ))}
        </div>

        <ChartContainer config={chartConfig} className="h-24 w-full">
          <BarChart data={rtoTrendData} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="4 4" />
            <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 9 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="returns" fill="var(--color-returns)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}