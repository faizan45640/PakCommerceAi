// auto-approval-rules.tsx
"use client";

import { ArrowRight, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const approvalRules = [
  {
    id: 1,
    name: "Low Value Orders",
    condition: "Order total < $100",
    channel: "All Channels",
    status: "Active",
    ordersAutoApproved: 1247,
  },
  {
    id: 2,
    name: "Repeat Customers",
    condition: "Customer history > 5 orders",
    channel: "WhatsApp Only",
    status: "Active",
    ordersAutoApproved: 892,
  },
  {
    id: 3,
    name: "Trusted Cities",
    condition: "Delivery city in [Karachi, Lahore, Islamabad]",
    channel: "All Channels",
    status: "Inactive",
    ordersAutoApproved: 0,
  },
  {
    id: 4,
    name: "Low Risk Products",
    condition: "Product category in [Apparel, Accessories]",
    channel: "WhatsApp Only",
    status: "Active",
    ordersAutoApproved: 567,
  },
];

function StatusBadge({ status }: { status: string }) {
  const config = {
    Active: { className: "bg-green-500/10 border-green-600/50 text-green-700 dark:text-green-300" },
    Inactive: { className: "bg-gray-500/10 border-gray-600/50 text-gray-700 dark:text-gray-300" },
  };
  
  const { className } = config[status as keyof typeof config] || config.Inactive;
  
  return (
    <Badge variant="secondary" className={`rounded-md px-2.5 py-1 font-medium text-[10px] ${className}`}>
      {status}
    </Badge>
  );
}

export function AutoApprovalRules() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Zap className="size-4 text-muted-foreground" />
          Auto-Approval Rules
        </CardTitle>
        <CardAction className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
            <Plus className="size-3" />
            Add Rule
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs">
            <ArrowRight className="size-3" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {approvalRules.map((rule) => (
            <div key={rule.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{rule.name}</span>
                    <StatusBadge status={rule.status} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    <span>Condition: {rule.condition}</span>
                    <span className="mx-1.5">•</span>
                    <span>{rule.channel}</span>
                  </div>
                  {rule.status === "Active" && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Auto-approved {rule.ordersAutoApproved.toLocaleString()} orders
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon-sm" variant="ghost" className="h-7 w-7">
                    {rule.status === "Active" ? <ToggleRight className="size-4 text-green-500" /> : <ToggleLeft className="size-4 text-muted-foreground" />}
                  </Button>
                  <Button size="icon-sm" variant="ghost" className="h-7 w-7">
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" className="h-7 w-7 text-destructive">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}