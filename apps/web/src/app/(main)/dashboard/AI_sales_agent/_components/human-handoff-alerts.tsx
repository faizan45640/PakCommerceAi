// human-handoff-alerts.tsx
"use client";

import { ArrowRight, AlertTriangle, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const handoffAlerts = [
  {
    id: "HAND-2024-0018",
    customer: "Sarah Chen",
    issue: "Confused about size guide",
    reason: "Multiple follow-up questions about measurements",
    time: "3 mins ago",
    confidence: 45,
    urgency: "High",
  },
  {
    id: "HAND-2024-0017",
    customer: "Mike Johnson",
    issue: "Unsure about return policy",
    reason: "Customer asked same question 3 times",
    time: "15 mins ago",
    confidence: 52,
    urgency: "Medium",
  },
  {
    id: "HAND-2024-0016",
    customer: "Emily Brown",
    issue: "Complex customization request",
    reason: "Multiple product modifications requested",
    time: "28 mins ago",
    confidence: 38,
    urgency: "High",
  },
  {
    id: "HAND-2024-0015",
    customer: "David Kim",
    issue: "Payment issue on WhatsApp",
    reason: "Unable to process payment link",
    time: "45 mins ago",
    confidence: 58,
    urgency: "Medium",
  },
];

function UrgencyBadge({ urgency }: { urgency: string }) {
  const config = {
    High: { className: "bg-destructive/10 border-destructive/50 text-destructive" },
    Medium: { className: "bg-yellow-500/10 border-yellow-600/50 text-yellow-700 dark:text-yellow-300" },
    Low: { className: "bg-blue-500/10 border-blue-600/50 text-blue-700 dark:text-blue-300" },
  };
  
  const { className } = config[urgency as keyof typeof config] || config.Low;
  
  return (
    <Badge variant="secondary" className={`rounded-md px-2.5 py-1 font-medium text-[10px] ${className}`}>
      {urgency} Priority
    </Badge>
  );
}

function ConfidenceScore({ confidence }: { confidence: number }) {
  const color = confidence >= 60 ? "bg-green-500" : confidence >= 40 ? "bg-yellow-500" : "bg-destructive";
  
  return (
    <div className="flex items-center gap-1.5">
      <div className="text-xs font-medium">{confidence}%</div>
      <div className="h-1.5 w-10 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${confidence}%` }} />
      </div>
    </div>
  );
}

export function HumanHandoffAlerts() {
  return (
    <Card className="border-destructive/20">
      <CardHeader className="bg-destructive/5 border-b border-destructive/20">
        <CardTitle className="flex items-center gap-2 text-sm">
          <AlertTriangle className="size-4 text-destructive" />
          Human Handoff Alerts
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          View All <ArrowRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y divide-border">
          {handoffAlerts.map((alert) => (
            <div key={alert.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{alert.customer}</span>
                    <UrgencyBadge urgency={alert.urgency} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    <span>{alert.issue}</span>
                    <span className="mx-1.5">•</span>
                    <span>{alert.reason}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs">
                    <span className="text-muted-foreground">{alert.time}</span>
                    <ConfidenceScore confidence={alert.confidence} />
                  </div>
                </div>
                <Button size="sm" className="h-7 shrink-0">
                  Take Over
                  <ChevronRight className="size-3 ml-1" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}