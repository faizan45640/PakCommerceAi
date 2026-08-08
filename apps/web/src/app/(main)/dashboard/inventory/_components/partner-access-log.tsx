// partner-access-log.tsx
"use client";

import { ArrowRight, Users, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const accessLog = [
  { partner: "Fashion Hub", product: "T-Shirt - L", sku: "TS-L-001", action: "viewed", timestamp: "10 minutes ago" },
  { partner: "Style Mart", product: "Jeans - 32", sku: "JN-32-002", action: "synced", timestamp: "25 minutes ago" },
  { partner: "Trend Wear", product: "Sneakers - 10", sku: "SN-10-003", action: "modified", timestamp: "1 hour ago" },
  { partner: "Fashion Hub", product: "Jacket - M", sku: "JK-M-004", action: "viewed", timestamp: "2 hours ago" },
  { partner: "Style Mart", product: "Hat - One Size", sku: "HT-OS-005", action: "synced", timestamp: "3 hours ago" },
  { partner: "Trend Wear", product: "Scarf - Red", sku: "SC-R-006", action: "viewed", timestamp: "4 hours ago" },
  { partner: "Fashion Hub", product: "T-Shirt - XL", sku: "TS-XL-007", action: "modified", timestamp: "5 hours ago" },
];

function ActionBadge({ action }: { action: string }) {
  const config = {
    viewed: { label: "Viewed", className: "bg-blue-500/10 border-blue-600/50 text-blue-700 dark:text-blue-300" },
    synced: { label: "Synced", className: "bg-green-500/10 border-green-600/50 text-green-700 dark:text-green-300" },
    modified: { label: "Modified", className: "bg-yellow-500/10 border-yellow-600/50 text-yellow-700 dark:text-yellow-300" },
  };
  
  const { label, className } = config[action as keyof typeof config] || config.viewed;
  
  return (
    <Badge variant="secondary" className={`rounded-md px-2.5 py-1 font-medium text-[10px] ${className}`}>
      {label}
    </Badge>
  );
}

export function PartnerAccessLog() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Users className="size-4 text-muted-foreground" />
          Partner Access Log
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          View Audit Trail <ArrowRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y divide-border">
          {accessLog.map((entry, index) => (
            <div key={index} className="grid grid-cols-[auto_1fr_auto] gap-2 py-3 first:pt-0 last:pb-0 items-center">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="font-medium text-sm leading-none">{entry.partner}</span>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{entry.product}</span>
                  <span className="font-mono text-[10px]">{entry.sku}</span>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Clock className="size-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground whitespace-nowrap">{entry.timestamp}</span>
              </div>
              <ActionBadge action={entry.action} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}