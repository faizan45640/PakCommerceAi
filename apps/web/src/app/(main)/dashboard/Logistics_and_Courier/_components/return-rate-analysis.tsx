// return-rate-analysis.tsx
"use client";

import { ArrowRight, MapPin, Package } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const returnRateByCity = [
  { city: "Mumbai", rate: 7.2, orders: 342, returns: 25 },
  { city: "Delhi", rate: 12.8, orders: 289, returns: 37 },
  { city: "Bangalore", rate: 5.3, orders: 356, returns: 19 },
  { city: "Chennai", rate: 9.7, orders: 278, returns: 27 },
  { city: "Hyderabad", rate: 6.1, orders: 312, returns: 19 },
  { city: "Kolkata", rate: 14.5, orders: 196, returns: 28 },
  { city: "Pune", rate: 4.8, orders: 268, returns: 13 },
  { city: "Ahmedabad", rate: 8.3, orders: 207, returns: 17 },
];

const returnRateByProduct = [
  { product: "T-Shirt - L", sku: "TS-L-001", rate: 8.4, orders: 178, returns: 15 },
  { product: "Jeans - 32", sku: "JN-32-002", rate: 6.7, orders: 194, returns: 13 },
  { product: "Sneakers - 10", sku: "SN-10-003", rate: 14.2, orders: 162, returns: 23 },
  { product: "Jacket - M", sku: "JK-M-004", rate: 11.8, orders: 144, returns: 17 },
  { product: "Hat - One Size", sku: "HT-OS-005", rate: 3.9, orders: 179, returns: 7 },
  { product: "Scarf - Red", sku: "SC-R-006", rate: 5.6, orders: 161, returns: 9 },
];

const chartConfig = {
  rate: {
    label: "Return Rate",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

export function ReturnRateAnalysis() {
  const topReturnCity = returnRateByCity.reduce((max, city) => 
    city.rate > max.rate ? city : max, returnRateByCity[0]
  );
  const topReturnProduct = returnRateByProduct.reduce((max, product) => 
    product.rate > max.rate ? product : max, returnRateByProduct[0]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Package className="size-4 text-muted-foreground" />
          Return Rate Analysis
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          View Full Report <ArrowRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md bg-destructive/5 border border-destructive/20 p-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" />
              Highest by City
            </div>
            <div className="font-medium text-sm">{topReturnCity.city}</div>
            <div className="text-destructive text-sm">{topReturnCity.rate}% RTO</div>
          </div>
          <div className="rounded-md bg-destructive/5 border border-destructive/20 p-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Package className="size-3" />
              Highest by Product
            </div>
            <div className="font-medium text-sm">{topReturnProduct.product}</div>
            <div className="text-destructive text-sm">{topReturnProduct.rate}% RTO</div>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">Return Rate by City</div>
          <ChartContainer config={chartConfig} className="h-32 w-full">
            <BarChart data={returnRateByCity.slice(0, 6)} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="4 4" />
              <XAxis dataKey="city" axisLine={false} tickLine={false} tick={{ fontSize: 9 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="rate" fill="var(--color-rate)" radius={4} />
            </BarChart>
          </ChartContainer>
        </div>

        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">Top Products by Return Rate</div>
          <div className="space-y-1.5">
            {returnRateByProduct.slice(0, 4).map((item) => (
              <div key={item.sku} className="flex items-center gap-2">
                <div className="min-w-24 text-xs truncate">{item.product}</div>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${item.rate > 10 ? "bg-destructive" : item.rate > 7 ? "bg-yellow-500" : "bg-green-500"}`}
                    style={{ width: `${Math.min(item.rate * 5, 100)}%` }} 
                  />
                </div>
                <div className="min-w-12 text-right text-xs font-medium">{item.rate}%</div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}