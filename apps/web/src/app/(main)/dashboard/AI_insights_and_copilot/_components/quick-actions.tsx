// quick-actions.tsx
"use client";

import { ArrowRight, BarChart3, Package, RefreshCw, Sparkles, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const quickActions = [
  {
    id: "analyze",
    label: "Analyze Sales",
    description: "Get AI insights on sales performance",
    icon: BarChart3,
    color: "bg-blue-500/10 text-blue-500",
  },
  {
    id: "sync",
    label: "Sync Inventory",
    description: "Run AI-assisted inventory sync",
    icon: RefreshCw,
    color: "bg-green-500/10 text-green-500",
  },
  {
    id: "insights",
    label: "Generate Insights",
    description: "Find hidden patterns in your data",
    icon: Sparkles,
    color: "bg-purple-500/10 text-purple-500",
  },
  {
    id: "optimize",
    label: "Optimize Pricing",
    description: "AI-powered price recommendations",
    icon: Package,
    color: "bg-yellow-500/10 text-yellow-500",
  },
];

export function QuickActions() {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Zap className="size-4 text-muted-foreground" />
          Quick AI Actions
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2">
            View All <ArrowRight className="size-3 ml-1" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2">
        {quickActions.map((action) => {
          const Icon = action.icon;
          
          return (
            <Button
              key={action.id}
              variant="outline"
              className="h-auto flex-col items-start gap-1 p-2.5 hover:bg-muted/30"
            >
              <div className="flex w-full items-center justify-between">
                <div className={`rounded-lg p-1.5 ${action.color}`}>
                  <Icon className="size-3.5" />
                </div>
                <ArrowRight className="size-3 text-muted-foreground" />
              </div>
              <div className="text-left w-full">
                <div className="font-medium text-xs leading-none truncate w-full">{action.label}</div>
                <div className="text-[10px] text-muted-foreground leading-tight mt-0.5 line-clamp-1">{action.description}</div>
              </div>
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}