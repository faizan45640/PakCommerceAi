// automated-insight-cards.tsx
"use client";

import { ArrowRight, TrendingUp, TrendingDown, AlertTriangle, Sparkles, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const insights = [
  {
    id: 1,
    type: "alert",
    title: "Returns from Karachi rose 12% this week",
    description: "Return rate increased to 8.4% from 7.5% last week. Top products affected: Sneakers (18%), Jackets (12%)",
    time: "2 hours ago",
    confidence: 96,
    actionable: true,
  },
  {
    id: 2,
    type: "opportunity",
    title: "Lahore sales up 24% - capitalize on momentum",
    description: "Sales in Lahore have surged 24% in the last 7 days. Consider increasing stock allocation and running targeted ads.",
    time: "4 hours ago",
    confidence: 89,
    actionable: true,
  },
  {
    id: 3,
    type: "warning",
    title: "Stock alert: Premium T-Shirts running low",
    description: "Premium T-Shirts (Size L, XL) are at 15% stock remaining. Reorder recommended within 3-5 days.",
    time: "6 hours ago",
    confidence: 98,
    actionable: true,
  },
  {
    id: 4,
    type: "insight",
    title: "WhatsApp channel outperforming by 34%",
    description: "WhatsApp sales conversion rate is 34% higher than Shopify. Consider expanding WhatsApp commerce capabilities.",
    time: "12 hours ago",
    confidence: 85,
    actionable: false,
  },
  {
    id: 5,
    type: "alert",
    title: "Delivery delays in Islamabad reported",
    description: "Average delivery time increased to 4.8 days (vs 3.2 days target). Courier performance flagged for review.",
    time: "1 day ago",
    confidence: 92,
    actionable: true,
  },
  {
    id: 6,
    type: "opportunity",
    title: "New customer segment identified",
    description: "Young professionals (25-35) showing 40% higher engagement on WhatsApp. Consider targeted campaigns.",
    time: "2 days ago",
    confidence: 78,
    actionable: true,
  },
];

function InsightIcon({ type }: { type: string }) {
  const config = {
    alert: { icon: AlertTriangle, className: "text-destructive" },
    opportunity: { icon: TrendingUp, className: "text-green-500" },
    warning: { icon: TrendingDown, className: "text-yellow-500" },
    insight: { icon: Sparkles, className: "text-blue-500" },
  };
  
  const { icon: Icon, className } = config[type as keyof typeof config] || config.insight;
  
  return <Icon className={`size-3.5 shrink-0 ${className}`} />;
}

function InsightBadge({ type }: { type: string }) {
  const config = {
    alert: { label: "Alert", className: "bg-destructive/10 border-destructive/50 text-destructive" },
    opportunity: { label: "Opportunity", className: "bg-green-500/10 border-green-600/50 text-green-700 dark:text-green-300" },
    warning: { label: "Warning", className: "bg-yellow-500/10 border-yellow-600/50 text-yellow-700 dark:text-yellow-300" },
    insight: { label: "Insight", className: "bg-blue-500/10 border-blue-600/50 text-blue-700 dark:text-blue-300" },
  };
  
  const { label, className } = config[type as keyof typeof config] || config.insight;
  
  return (
    <Badge variant="secondary" className={`shrink-0 rounded-md px-2 py-0.5 font-medium text-[9px] ${className}`}>
      {label}
    </Badge>
  );
}

export function AutomatedInsightCards() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Zap className="size-4 text-yellow-500 shrink-0" />
          <h3 className="font-medium text-sm truncate">Proactive AI Insights</h3>
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {insights.length} active
          </Badge>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0 px-2">
          View All <ArrowRight className="size-3 ml-1" />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {insights.slice(0, 6).map((insight) => (
          <Card key={insight.id} className="border-l-4 overflow-hidden min-w-0" style={{
            borderLeftColor: insight.type === 'alert' ? 'var(--destructive)' : 
                           insight.type === 'opportunity' ? 'var(--chart-2)' :
                           insight.type === 'warning' ? 'var(--yellow-500)' : 'var(--chart-1)'
          }}>
            <CardHeader className="pb-1.5 px-4 pt-3">
              <div className="flex items-start justify-between gap-1.5 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <InsightIcon type={insight.type} />
                  <CardTitle className="text-xs truncate min-w-0">{insight.title}</CardTitle>
                </div>
                <InsightBadge type={insight.type} />
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5 px-4 pb-3">
              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{insight.description}</p>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground shrink-0">{insight.time}</span>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                    {insight.confidence}%
                  </Badge>
                  {insight.actionable && (
                    <Button size="sm" className="h-5 text-[9px] px-1.5 py-0">
                      Act Now
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}