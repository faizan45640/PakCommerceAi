// agent-confidence-indicator.tsx
"use client";

import { ArrowRight, Gauge, TrendingUp, TrendingDown } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const confidenceData = [
  { day: "Mon", confidence: 82, orders: 24 },
  { day: "Tue", confidence: 85, orders: 31 },
  { day: "Wed", confidence: 79, orders: 28 },
  { day: "Thu", confidence: 88, orders: 36 },
  { day: "Fri", confidence: 86, orders: 42 },
  { day: "Sat", confidence: 92, orders: 38 },
  { day: "Sun", confidence: 84, orders: 22 },
];

const chartConfig = {
  confidence: {
    label: "Confidence",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

export function AgentConfidenceIndicator() {
  const avgConfidence = confidenceData.reduce((sum, d) => sum + d.confidence, 0) / confidenceData.length;
  const totalOrders = confidenceData.reduce((sum, d) => sum + d.orders, 0);
  const trend = confidenceData[confidenceData.length - 1].confidence - confidenceData[0].confidence;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Gauge className="size-4 text-muted-foreground" />
          Agent Confidence Indicator
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          View Report <ArrowRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md bg-muted/50 p-2 text-center">
            <div className="text-xs text-muted-foreground">Avg. Confidence</div>
            <div className={`font-semibold text-lg ${avgConfidence >= 80 ? "text-green-600" : avgConfidence >= 60 ? "text-yellow-600" : "text-destructive"}`}>
              {avgConfidence.toFixed(1)}%
            </div>
          </div>
          <div className="rounded-md bg-muted/50 p-2 text-center">
            <div className="text-xs text-muted-foreground">Orders Generated</div>
            <div className="font-semibold text-lg">{totalOrders}</div>
          </div>
          <div className="rounded-md bg-muted/50 p-2 text-center">
            <div className="text-xs text-muted-foreground">Trend</div>
            <div className={`flex items-center justify-center gap-1 font-semibold text-lg ${trend >= 0 ? "text-green-600" : "text-destructive"}`}>
              {trend >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
              {Math.abs(trend)}%
            </div>
          </div>
        </div>

        <ChartContainer config={chartConfig} className="h-32 w-full">
          <AreaChart data={confidenceData} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="confidenceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-confidence)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-confidence)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="4 4" />
            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} domain={[60, 100]} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area 
              type="monotone" 
              dataKey="confidence" 
              stroke="var(--color-confidence)" 
              fill="url(#confidenceGradient)" 
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Min confidence: 79%</span>
          <span className="text-muted-foreground">Max confidence: 92%</span>
          <Badge variant="outline" className="text-[10px]">
            {confidenceData.length} days tracked
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}