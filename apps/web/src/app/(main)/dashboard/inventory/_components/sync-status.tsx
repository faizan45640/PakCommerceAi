// sync-status.tsx
"use client";

import { ArrowRight, CheckCircle, Clock, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const syncStatusData = [
  { store: "Main Store", status: "success", lastSync: "2 minutes ago", products: 1245, pending: 0 },
  { store: "Partner Store A", status: "success", lastSync: "15 minutes ago", products: 876, pending: 3 },
  { store: "Partner Store B", status: "pending", lastSync: "45 minutes ago", products: 543, pending: 12 },
  { store: "Partner Store C", status: "failed", lastSync: "2 hours ago", products: 234, pending: 8 },
  { store: "Marketplace X", status: "success", lastSync: "1 hour ago", products: 189, pending: 0 },
  { store: "Marketplace Y", status: "pending", lastSync: "3 hours ago", products: 67, pending: 15 },
];

function SyncStatusBadge({ status }: { status: string }) {
  const config = {
    success: { icon: CheckCircle, label: "Synced", className: "text-green-600 dark:text-green-400 border-green-600/50 bg-green-50 dark:bg-green-500/10" },
    pending: { icon: Clock, label: "Syncing...", className: "text-yellow-600 dark:text-yellow-400 border-yellow-600/50 bg-yellow-50 dark:bg-yellow-500/10" },
    failed: { icon: XCircle, label: "Failed", className: "text-destructive border-destructive/50 bg-destructive/10" },
  };
  
  const { icon: Icon, label, className } = config[status as keyof typeof config] || config.pending;
  
  return (
    <Badge variant="secondary" className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium text-[10px] ${className}`}>
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}

export function SyncStatus() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Sync Status</CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          Manage Sync <ArrowRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y divide-border">
          {syncStatusData.map((store) => (
            <div key={store.store} className="grid grid-cols-[1fr_auto_auto] gap-3 py-3 first:pt-0 last:pb-0 items-center">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-medium text-sm leading-none">{store.store}</span>
                <span className="text-muted-foreground text-xs leading-none">
                  {store.products} products · {store.pending > 0 ? `${store.pending} pending` : "all synced"}
                </span>
              </div>
              <span className="text-muted-foreground text-xs whitespace-nowrap">{store.lastSync}</span>
              <SyncStatusBadge status={store.status} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}