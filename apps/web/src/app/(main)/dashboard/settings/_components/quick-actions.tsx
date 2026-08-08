// quick-actions.tsx
"use client";

import { ArrowRight, Bell, Globe, Lock, Plug, Settings, Store, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const quickActions = [
  {
    id: "connect",
    label: "Connect Store",
    description: "Add new sales channel",
    icon: Plug,
    color: "bg-blue-500/10 text-blue-500",
  },
  {
    id: "settings",
    label: "Account Settings",
    description: "Manage profile & security",
    icon: User,
    color: "bg-purple-500/10 text-purple-500",
  },
  {
    id: "notifications",
    label: "Notification Settings",
    description: "Configure alerts",
    icon: Bell,
    color: "bg-yellow-500/10 text-yellow-500",
  },
  {
    id: "language",
    label: "Language & Region",
    description: "Switch UI language",
    icon: Globe,
    color: "bg-green-500/10 text-green-500",
  },
  {
    id: "stores",
    label: "Manage Stores",
    description: "View all connected stores",
    icon: Store,
    color: "bg-indigo-500/10 text-indigo-500",
  },
  {
    id: "privacy",
    label: "Privacy Settings",
    description: "Data sharing controls",
    icon: Lock,
    color: "bg-red-500/10 text-red-500",
  },
];

export function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Settings className="size-4 text-muted-foreground" />
          Quick Settings
        </CardTitle>
        <CardAction className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 text-xs">
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
              className="h-auto flex-col items-start gap-1 p-3 hover:bg-muted/30"
            >
              <div className="flex w-full items-center justify-between">
                <div className={`rounded-lg p-1.5 ${action.color}`}>
                  <Icon className="size-3.5" />
                </div>
                <ArrowRight className="size-3 text-muted-foreground" />
              </div>
              <div className="text-left">
                <div className="font-medium text-xs leading-none">{action.label}</div>
                <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{action.description}</div>
              </div>
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}