import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: string;
  helperText?: string;
  trend?: {
    value: string;
    direction: "up" | "down";
  };
  className?: string;
  action?: ReactNode;
};

export function MetricCard({ label, value, helperText, trend, className, action }: MetricCardProps) {
  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="font-normal text-sm">{label}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div className="text-2xl leading-none tracking-tight">{value}</div>
          {trend ? (
            <Badge
              className={cn(
                trend.direction === "up"
                  ? "bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                  : "bg-red-500/10 text-red-700 dark:bg-red-500/15 dark:text-red-300",
              )}
            >
              {trend.direction === "up" ? <ArrowUpRight /> : <ArrowDownRight />}
              {trend.value}
            </Badge>
          ) : null}
        </div>
        {helperText ? <p className="text-muted-foreground text-xs">{helperText}</p> : null}
      </CardContent>
    </Card>
  );
}
