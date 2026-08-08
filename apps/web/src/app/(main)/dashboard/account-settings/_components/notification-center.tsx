// notification-center.tsx
"use client";

import { ArrowRight, Bell, CheckCircle, Clock, Package, RefreshCw, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const notifications = [
  {
    id: 1,
    type: "alert",
    title: "Low Stock Alert",
    message: "Premium T-Shirts (Size L) running low - only 12 units remaining",
    time: "5 mins ago",
    read: false,
    icon: Package,
    priority: "High",
  },
  {
    id: 2,
    type: "warning",
    title: "Sync Failed",
    message: "Partner Store C sync failed due to timeout. Retry scheduled.",
    time: "15 mins ago",
    read: false,
    icon: RefreshCw,
    priority: "Medium",
  },
  {
    id: 3,
    type: "info",
    title: "RTO Spike Detected",
    message: "Return rate increased to 8.4% in Karachi. 23 orders affected.",
    time: "1 hour ago",
    read: false,
    icon: Send,
    priority: "High",
  },
  {
    id: 4,
    type: "success",
    title: "Human Handoff Request",
    message: "Customer Sarah Chen needs manual assistance with order #ORD-2024-0042",
    time: "2 hours ago",
    read: true,
    icon: Clock,
    priority: "High",
  },
  {
    id: 5,
    type: "info",
    title: "Auto-Approval Applied",
    message: "3 orders auto-approved for repeat customers (Lahore region)",
    time: "3 hours ago",
    read: true,
    icon: CheckCircle,
    priority: "Low",
  },
];

function NotificationTypeBadge({ type }: { type: string }) {
  const config = {
    alert: { className: "bg-destructive/10 border-destructive/50 text-destructive" },
    warning: { className: "bg-yellow-500/10 border-yellow-600/50 text-yellow-700 dark:text-yellow-300" },
    info: { className: "bg-blue-500/10 border-blue-600/50 text-blue-700 dark:text-blue-300" },
    success: { className: "bg-green-500/10 border-green-600/50 text-green-700 dark:text-green-300" },
  };
  
  const { className } = config[type as keyof typeof config] || config.info;
  
  return (
    <Badge variant="secondary" className={`rounded-md px-2.5 py-1 font-medium text-[10px] ${className}`}>
      {type}
    </Badge>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const config = {
    High: { className: "bg-destructive/10 border-destructive/50 text-destructive" },
    Medium: { className: "bg-yellow-500/10 border-yellow-600/50 text-yellow-700 dark:text-yellow-300" },
    Low: { className: "bg-blue-500/10 border-blue-600/50 text-blue-700 dark:text-blue-300" },
  };
  
  const { className } = config[priority as keyof typeof config] || config.Low;
  
  return (
    <Badge variant="secondary" className={`rounded-md px-2.5 py-1 font-medium text-[10px] ${className}`}>
      {priority}
    </Badge>
  );
}

export function NotificationCenter() {
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <Card className="border-yellow-500/20">
      <CardHeader className="bg-yellow-500/5 border-b border-yellow-500/20">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Bell className="size-4 text-yellow-500" />
          Notification Center
          <Badge variant="secondary" className="ml-auto rounded-full px-2 py-0 text-[10px]">
            {unreadCount} unread
          </Badge>
        </CardTitle>
        <CardAction className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 text-xs">
            Mark All Read
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs">
            <ArrowRight className="size-3" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y divide-border">
          {notifications.map((notification) => {
            const Icon = notification.icon;
            
            return (
              <div key={notification.id} className={`py-3 first:pt-0 last:pb-0 ${!notification.read ? 'bg-yellow-500/5 -mx-4 px-4 rounded' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <Icon className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{notification.title}</span>
                      <NotificationTypeBadge type={notification.type} />
                      <PriorityBadge priority={notification.priority} />
                      {!notification.read && (
                        <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-600">
                          New
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{notification.message}</p>
                    <div className="text-[10px] text-muted-foreground mt-1">{notification.time}</div>
                  </div>
                  {!notification.read && (
                    <Button size="sm" variant="ghost" className="h-6 text-xs shrink-0">
                      Mark Read
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}