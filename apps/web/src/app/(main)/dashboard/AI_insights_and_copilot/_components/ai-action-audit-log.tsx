// ai-action-audit-log.tsx
"use client";

import { ArrowRight, Bot, CheckCircle, Clock, Package, RefreshCw, Send, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const auditLog = [
  {
    id: 1,
    action: "Draft order created",
    details: "Order #DRAFT-2024-0042 for Priya Patel - 2x Premium T-Shirts",
    time: "5 mins ago",
    status: "success",
    icon: Package,
  },
  {
    id: 2,
    action: "Stock sync triggered",
    details: "Synced inventory across Main Store, Partner Store A, Partner Store B",
    time: "12 mins ago",
    status: "success",
    icon: RefreshCw,
  },
  {
    id: 3,
    action: "Alert sent to seller",
    details: "Low stock alert for Sneakers - Size 10 (3 units remaining)",
    time: "25 mins ago",
    status: "success",
    icon: Send,
  },
  {
    id: 4,
    action: "Auto-approval rule applied",
    details: "Order #ORD-2024-0038 auto-approved ($89.99) - rule: Low Value Orders",
    time: "1 hour ago",
    status: "success",
    icon: CheckCircle,
  },
  {
    id: 5,
    action: "Human handoff flagged",
    details: "Conversation #CONV-2024-0041 flagged for human review",
    time: "2 hours ago",
    status: "warning",
    icon: Clock,
  },
  {
    id: 6,
    action: "Sync failed - retry scheduled",
    details: "Partner Store C sync failed (timeout). Retry scheduled in 15 mins",
    time: "3 hours ago",
    status: "error",
    icon: XCircle,
  },
];

function ActionStatusBadge({ status }: { status: string }) {
  const config = {
    success: { className: "bg-green-500/10 border-green-600/50 text-green-700 dark:text-green-300" },
    warning: { className: "bg-yellow-500/10 border-yellow-600/50 text-yellow-700 dark:text-yellow-300" },
    error: { className: "bg-destructive/10 border-destructive/50 text-destructive" },
  };
  
  const { className } = config[status as keyof typeof config] || config.success;
  
  return (
    <Badge variant="secondary" className={`rounded-md px-2.5 py-1 font-medium text-[10px] ${className}`}>
      {status}
    </Badge>
  );
}

export function AiActionAuditLog() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Bot className="size-4 text-muted-foreground" />
          AI Action Audit Log
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          <Button variant="ghost" size="sm" className="h-7 text-xs">
            View All <ArrowRight className="size-3 ml-1" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y divide-border">
          {auditLog.map((entry) => {
            const Icon = entry.icon;
            
            return (
              <div key={entry.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <Icon className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{entry.action}</span>
                      <ActionStatusBadge status={entry.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{entry.details}</p>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {entry.time}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}