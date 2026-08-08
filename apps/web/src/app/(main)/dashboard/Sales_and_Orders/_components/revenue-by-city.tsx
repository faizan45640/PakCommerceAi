// revenue-by-city.tsx
"use client";

import { ArrowRight, MapPin } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const cityData = [
  { city: "Karachi", revenue: 32450, orders: 412, percentage: 26.0 },
  { city: "Lahore", revenue: 28760, orders: 354, percentage: 23.0 },
  { city: "Islamabad", revenue: 21980, orders: 267, percentage: 17.6 },
  { city: "Rawalpindi", revenue: 16750, orders: 198, percentage: 13.4 },
  { city: "Faisalabad", revenue: 12340, orders: 156, percentage: 9.9 },
  { city: "Multan", revenue: 8760, orders: 112, percentage: 7.0 },
  { city: "Others", revenue: 3760, orders: 48, percentage: 3.0 },
];

const chartConfig = {
  revenue: {
    label: "Revenue",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

export function RevenueByCity() {
  //const totalRevenue = cityData.reduce((sum, d) => sum + d.revenue, 0);
  const topCity = cityData.reduce((max, d) => d.revenue > max.revenue ? d : max, cityData[0]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <MapPin className="size-4 text-muted-foreground" />
          Revenue by City
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          View Details <ArrowRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md bg-muted/50 p-2 text-center">
            <div className="text-xs text-muted-foreground">Top City</div>
            <div className="font-semibold">{topCity.city}</div>
            <div className="text-sm">${(topCity.revenue / 1000).toFixed(1)}K</div>
          </div>
          <div className="rounded-md bg-muted/50 p-2 text-center">
            <div className="text-xs text-muted-foreground">City Coverage</div>
            <div className="font-semibold">{cityData.length}</div>
            <div className="text-sm text-muted-foreground">cities</div>
          </div>
        </div>

        <ChartContainer config={chartConfig} className="h-40 w-full">
          <BarChart data={cityData} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="4 4" />
            <XAxis dataKey="city" axisLine={false} tickLine={false} tick={{ fontSize: 9 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
          </BarChart>
        </ChartContainer>

        <div className="flex flex-wrap gap-1">
          {cityData.map((item) => (
            <Badge key={item.city} variant="outline" className="text-[10px]">
              {item.city}: ${(item.revenue / 1000).toFixed(1)}K ({item.percentage}%)
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}