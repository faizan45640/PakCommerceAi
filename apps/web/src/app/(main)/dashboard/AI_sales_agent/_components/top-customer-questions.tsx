// top-customer-questions.tsx
"use client";

import { ArrowRight, MessageSquare, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const questionsData = [
  { question: "Product availability", count: 342, percentage: 18.4 },
  { question: "Delivery timeline", count: 287, percentage: 15.4 },
  { question: "Return policy", count: 234, percentage: 12.6 },
  { question: "Payment methods", count: 198, percentage: 10.6 },
  { question: "Size guide", count: 167, percentage: 9.0 },
  { question: "Shipping cost", count: 145, percentage: 7.8 },
  { question: "Product details", count: 123, percentage: 6.6 },
  { question: "Discounts/offers", count: 98, percentage: 5.3 },
  { question: "Order tracking", count: 76, percentage: 4.1 },
  { question: "Warranty", count: 54, percentage: 2.9 },
];

const chartConfig = {
  count: {
    label: "Questions",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function TopCustomerQuestions() {
  const totalQuestions = questionsData.reduce((sum, q) => sum + q.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <MessageSquare className="size-4 text-muted-foreground" />
          Top Customer Questions
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          View All <ArrowRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-semibold leading-none tracking-tight">{totalQuestions.toLocaleString()}</div>
            <div className="text-muted-foreground text-xs">Total questions asked</div>
          </div>
          <Badge variant="outline" className="text-[10px]">
            <TrendingUp className="size-3 mr-1" />
            23.5% increase
          </Badge>
        </div>

        <ChartContainer config={chartConfig} className="h-44 w-full">
          <BarChart data={questionsData.slice(0, 8)} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="4 4" />
            <XAxis dataKey="question" axisLine={false} tickLine={false} tick={{ fontSize: 9 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={4} />
          </BarChart>
        </ChartContainer>

        <div className="flex flex-wrap gap-1.5">
          {questionsData.slice(0, 6).map((item) => (
            <Badge key={item.question} variant="outline" className="text-[10px]">
              {item.question}: {item.count}
            </Badge>
          ))}
          {questionsData.length > 6 && (
            <Badge variant="outline" className="text-[10px]">
              +{questionsData.length - 6} more
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}