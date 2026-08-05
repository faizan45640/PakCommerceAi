// ai-kpi-cards.tsx
import { ArrowDownRight, ArrowUpRight, Bot, Brain, Sparkles, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

export function AiKpiCards() {
  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-3xl tracking-tight">AI Copilot Overview</h2>
        <p className="text-muted-foreground text-sm">
          Your AI assistant analyzes sales data, generates insights, and automates actions across your business.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>AI Actions Taken</CardDescription>
            <CardAction>
              <Bot className="size-4 text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-3xl leading-none tracking-tight">1,847</span>
              <Badge
                variant="outline"
                className="border-green-200 bg-green-500/10 text-green-700 dark:border-green-900/40 dark:bg-green-500/15 dark:text-green-300"
              >
                <ArrowUpRight />
                +24%
              </Badge>
            </div>
            <p className="text-sm">
              <span className="font-medium text-foreground">1,490</span>{" "}
              <span className="text-muted-foreground">last month</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Active Insights</CardDescription>
            <CardAction>
              <Brain className="size-4 text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-3xl leading-none tracking-tight">23</span>
              <Badge variant="outline" className="border-green-200 bg-green-500/10 text-green-700 dark:border-green-900/40 dark:bg-green-500/15 dark:text-green-300">
                <ArrowUpRight />
                +5
              </Badge>
            </div>
            <p className="text-sm">
              <span className="font-medium text-foreground">18</span>{" "}
              <span className="text-muted-foreground">last week</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Avg. Query Confidence</CardDescription>
            <CardAction>
              <Sparkles className="size-4 text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-3xl leading-none tracking-tight">87.6%</span>
              <Badge
                variant="outline"
                className="border-green-200 bg-green-500/10 text-green-700 dark:border-green-900/40 dark:bg-green-500/15 dark:text-green-300"
              >
                <ArrowUpRight />
                +3.2%
              </Badge>
            </div>
            <p className="text-sm">
              <span className="font-medium text-foreground">84.4%</span>{" "}
              <span className="text-muted-foreground">last month</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Auto-Approved Actions</CardDescription>
            <CardAction>
              <Zap className="size-4 text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-3xl leading-none tracking-tight">892</span>
              <Badge
                variant="outline"
                className="border-green-200 bg-green-500/10 text-green-700 dark:border-green-900/40 dark:bg-green-500/15 dark:text-green-300"
              >
                <ArrowUpRight />
                +18%
              </Badge>
            </div>
            <p className="text-sm">
              <span className="font-medium text-foreground">756</span>{" "}
              <span className="text-muted-foreground">last month</span>
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}