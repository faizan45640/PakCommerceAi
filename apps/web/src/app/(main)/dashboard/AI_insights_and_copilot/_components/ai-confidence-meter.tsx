// ai-confidence-meter.tsx
"use client";

import { ArrowRight, Gauge, TrendingUp, TrendingDown } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const confidenceData = [
  { day: "Mon", confidence: 82, actions: 24 },
  { day: "Tue", confidence: 88, actions: 31 },
  { day: "Wed", confidence: 79, actions: 28 },
  { day: "Thu", confidence: 91, actions: 36 },
  { day: "Fri", confidence: 86, actions: 42 },
  { day: "Sat", confidence: 94, actions: 38 },
  { day: "Sun", confidence: 85, actions: 22 },
];

const chartConfig = {
  confidence: {
    label: "Confidence",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function AiConfidenceMeter() {
  const avgConfidence = confidenceData.reduce((sum, d) => sum + d.confidence, 0) / confidenceData.length;
  const totalActions = confidenceData.reduce((sum, d) => sum + d.actions, 0);
  const trend = confidenceData[confidenceData.length - 1].confidence - confidenceData[0].confidence;

  return (
    <Card className="h-full overflow-hidden min-w-0">
      <CardHeader className="pb-1.5 px-3 pt-3">
        <CardTitle className="flex items-center gap-1.5 text-xs min-w-0">
          <Gauge className="size-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">AI Confidence</span>
        </CardTitle>
        <CardAction className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5">
            Details <ArrowRight className="size-2.5 ml-0.5" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-3">
        <div className="grid grid-cols-3 gap-1">
          <div className="rounded-md bg-muted/50 p-1.5 text-center min-w-0">
            <div className="text-[8px] text-muted-foreground uppercase tracking-wider">Avg. Conf</div>
            <div className={`font-semibold text-sm ${avgConfidence >= 80 ? "text-green-600" : avgConfidence >= 60 ? "text-yellow-600" : "text-destructive"}`}>
              {avgConfidence.toFixed(1)}%
            </div>
          </div>
          <div className="rounded-md bg-muted/50 p-1.5 text-center min-w-0">
            <div className="text-[8px] text-muted-foreground uppercase tracking-wider">Actions</div>
            <div className="font-semibold text-sm">{totalActions}</div>
          </div>
          <div className="rounded-md bg-muted/50 p-1.5 text-center min-w-0">
            <div className="text-[8px] text-muted-foreground uppercase tracking-wider">Trend</div>
            <div className={`flex items-center justify-center gap-0.5 font-semibold text-sm ${trend >= 0 ? "text-green-600" : "text-destructive"}`}>
              {trend >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {Math.abs(trend)}%
            </div>
          </div>
        </div>

        <ChartContainer config={chartConfig} className="h-20 w-full">
          <AreaChart data={confidenceData} margin={{ left: 0, right: 0, top: 2, bottom: 0 }}>
            <defs>
              <linearGradient id="confidenceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-confidence)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-confidence)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="4 4" />
            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 8 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 8 }} domain={[60, 100]} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area 
              type="monotone" 
              dataKey="confidence" 
              stroke="var(--color-confidence)" 
              fill="url(#confidenceGradient)" 
              strokeWidth={1.5}
            />
          </AreaChart>
        </ChartContainer>

        <div className="flex items-center justify-between text-[9px]">
          <span className="text-muted-foreground">Min: 79% · Max: 94%</span>
          <Badge variant="outline" className="text-[8px] px-1 py-0">
            {confidenceData.length} days
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}