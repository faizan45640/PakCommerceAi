// revenue-by-channel.tsx
"use client";

import { ArrowRight, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const channelData = [
  { channel: "Shopify", revenue: 58420, orders: 436, percentage: 46.8 },
  { channel: "WhatsApp", revenue: 31250, orders: 312, percentage: 25.0 },
  { channel: "Daraz", revenue: 18760, orders: 278, percentage: 15.0 },
  { channel: "Instagram", revenue: 9350, orders: 89, percentage: 7.5 },
  { channel: "Facebook", revenue: 7120, orders: 67, percentage: 5.7 },
];

const chartConfig = {
  revenue: {
    label: "Revenue",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function RevenueByChannel() {
  const totalRevenue = channelData.reduce((sum, d) => sum + d.revenue, 0);
  const topChannel = channelData.reduce((max, d) => d.revenue > max.revenue ? d : max, channelData[0]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <TrendingUp className="size-4 text-muted-foreground" />
          Revenue by Channel
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          View Report <ArrowRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-semibold leading-none tracking-tight">${(totalRevenue / 1000).toFixed(1)}K</div>
            <div className="text-muted-foreground text-xs">Total Revenue</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium">{topChannel.channel}</div>
            <div className="text-muted-foreground text-xs">Top channel • {topChannel.percentage}%</div>
          </div>
        </div>

        <ChartContainer config={chartConfig} className="h-48 w-full">
          <BarChart data={channelData} layout="vertical" margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
            <CartesianGrid horizontal={false} strokeDasharray="4 4" />
            <XAxis type="number" hide />
            <YAxis dataKey="channel" axisLine={false} tickLine={false} tickMargin={8} tick={{ fontSize: 11 }} type="category" width={70} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
          </BarChart>
        </ChartContainer>

        <div className="flex flex-wrap gap-2">
          {channelData.map((item) => (
            <div key={item.channel} className="flex-1 min-w-[60px] text-center rounded-md bg-muted/50 p-1.5">
              <div className="text-xs text-muted-foreground">{item.channel}</div>
              <div className="font-semibold text-sm">${(item.revenue / 1000).toFixed(1)}K</div>
              <div className="text-muted-foreground text-[10px]">{item.percentage}%</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}