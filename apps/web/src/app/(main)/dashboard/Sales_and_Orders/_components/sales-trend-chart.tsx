// sales-trend-chart.tsx
"use client";

import { addDays, format, subDays } from "date-fns";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useEffect, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

// Simple seeded random number generator
const createSeededRandom = (seed: number) => {
  return function() {
    const x = Math.sin(seed) * 10000;
    seed += 1;
    return x - Math.floor(x);
  };
};

// Generate sales trend data for the last 30 days with deterministic values
const generateSalesData = () => {
  const data = [];
  const startDate = subDays(new Date(), 29);
  const random = createSeededRandom(42); // Fixed seed for consistency
  
  for (let i = 0; i < 30; i++) {
    const date = addDays(startDate, i);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const baseRevenue = isWeekend ? 2000 : 4500;
    const variance = Math.floor(random() * 2000) - 500;
    const revenue = Math.max(0, baseRevenue + variance);
    const orders = Math.round(revenue / Math.floor(random() * 20 + 40));
    
    data.push({
      date: format(date, "yyyy-MM-dd"),
      revenue: revenue,
      orders: orders,
      averageOrderValue: revenue / orders,
    });
  }
  
  return data;
};

// Generate data once at module level - consistent on server and client
const salesData = generateSalesData();

const chartConfig = {
  revenue: {
    label: "Revenue",
    color: "var(--chart-1)",
  },
  orders: {
    label: "Orders",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

// Helper function to safely format dates
const formatDate = (value: unknown): string => {
  if (typeof value === 'string') {
    return format(new Date(value), "MMM d");
  }
  return String(value);
};

// Helper function for tooltip label
const formatTooltipLabel = (value: unknown): string => {
  if (typeof value === 'string') {
    return format(new Date(value), "MMMM d, yyyy");
  }
  return String(value);
};

// Helper function for Y axis tick formatting
const formatYAxisTick = (value: number): string => {
  return `$${value / 1000}K`;
};

export function SalesTrendChart() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const totalRevenue = salesData.reduce((sum, d) => sum + d.revenue, 0);
  const totalOrders = salesData.reduce((sum, d) => sum + d.orders, 0);
  const avgRevenue = totalRevenue / salesData.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales Trend</CardTitle>
        <CardDescription>
          Daily revenue and order volume over the last 30 days
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="rounded-md bg-muted/50 p-2 text-center">
            <div className="text-xs text-muted-foreground">Total Revenue</div>
            <div className="font-semibold text-lg">${(totalRevenue / 1000).toFixed(1)}K</div>
          </div>
          <div className="rounded-md bg-muted/50 p-2 text-center">
            <div className="text-xs text-muted-foreground">Total Orders</div>
            <div className="font-semibold text-lg">{totalOrders}</div>
          </div>
          <div className="rounded-md bg-muted/50 p-2 text-center">
            <div className="text-xs text-muted-foreground">Avg. Daily Revenue</div>
            <div className="font-semibold text-lg">${avgRevenue.toFixed(0)}</div>
          </div>
        </div>

        <ChartContainer config={chartConfig} className="h-64 w-full">
          <AreaChart data={salesData} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="4 4" />
            <XAxis 
              dataKey="date" 
              axisLine={false} 
              tickLine={false} 
              tickMargin={8} 
              tick={{ fontSize: 10 }}
              tickFormatter={(value) => formatDate(value)}
              minTickGap={48}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tickMargin={8} 
              tick={{ fontSize: 10 }}
              tickFormatter={(value) => formatYAxisTick(value as number)}
            />
            <ChartTooltip 
              content={
                <ChartTooltipContent 
                  labelFormatter={(value) => formatTooltipLabel(value)}
                />
              } 
            />
            <Area 
              type="monotone" 
              dataKey="revenue" 
              stroke="var(--color-revenue)" 
              fill="url(#revenueGradient)" 
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}