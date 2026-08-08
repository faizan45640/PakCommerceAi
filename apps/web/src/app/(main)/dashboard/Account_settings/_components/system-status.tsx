// system-status.tsx
"use client";

import { ArrowRight, CheckCircle, Clock, Server, Shield, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const systemStatus = [
  {
    id: 1,
    name: "API Services",
    status: "Operational",
    icon: Server,
    uptime: "99.97%",
    latency: "42ms",
  },
  {
    id: 2,
    name: "AI Engine",
    status: "Operational",
    icon: Zap,
    uptime: "99.89%",
    latency: "128ms",
  },
  {
    id: 3,
    name: "Database",
    status: "Operational",
    icon: Shield,
    uptime: "99.99%",
    latency: "18ms",
  },
  {
    id: 4,
    name: "Sync Service",
    status: "Degraded",
    icon: Clock,
    uptime: "98.54%",
    latency: "245ms",
  },
  {
    id: 5,
    name: "Notification Service",
    status: "Operational",
    icon: CheckCircle,
    uptime: "99.92%",
    latency: "56ms",
  },
];

function StatusBadge({ status }: { status: string }) {
  const config = {
    Operational: { className: "bg-green-500/10 border-green-600/50 text-green-700 dark:text-green-300" },
    Degraded: { className: "bg-yellow-500/10 border-yellow-600/50 text-yellow-700 dark:text-yellow-300" },
    Down: { className: "bg-destructive/10 border-destructive/50 text-destructive" },
  };
  
  const { className } = config[status as keyof typeof config] || config.Operational;
  
  return (
    <Badge variant="secondary" className={`rounded-md px-2.5 py-1 font-medium text-[10px] ${className}`}>
      {status}
    </Badge>
  );
}

export function SystemStatus() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Server className="size-4 text-muted-foreground" />
          System Status
        </CardTitle>
        <CardAction className="flex items-center gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-green-500" />
            </span>
            All systems operational
          </div>
          <Button size="sm" variant="ghost" className="h-7 text-xs">
            <ArrowRight className="size-3" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y divide-border">
          {systemStatus.map((item) => {
            const Icon = item.icon;
            
            return (
              <div key={item.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-xs text-muted-foreground">
                      {item.uptime} • {item.latency}
                    </div>
                    <StatusBadge status={item.status} />
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