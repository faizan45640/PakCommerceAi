// pending-settlements.tsx
"use client";

import { ArrowRight, Clock, DollarSign } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const settlements = [
  {
    courier: "BlueDart",
    amount: 5840.50,
    orders: 63,
    pendingSince: "8 days",
    expectedDate: "2024-12-10",
    status: "Due Soon",
  },
  {
    courier: "DTDC",
    amount: 3890.75,
    orders: 42,
    pendingSince: "12 days",
    expectedDate: "2024-12-14",
    status: "Overdue",
  },
  {
    courier: "Delhivery",
    amount: 4950.00,
    orders: 56,
    pendingSince: "6 days",
    expectedDate: "2024-12-08",
    status: "Due Soon",
  },
  {
    courier: "Shadowfax",
    amount: 2150.25,
    orders: 28,
    pendingSince: "4 days",
    expectedDate: "2024-12-06",
    status: "On Track",
  },
  {
    courier: "XpressBees",
    amount: 1760.80,
    orders: 19,
    pendingSince: "2 days",
    expectedDate: "2024-12-04",
    status: "On Track",
  },
];

function StatusBadge({ status }: { status: string }) {
  const config = {
    "On Track": { className: "bg-green-500/10 border-green-600/50 text-green-700 dark:text-green-300" },
    "Due Soon": { className: "bg-yellow-500/10 border-yellow-600/50 text-yellow-700 dark:text-yellow-300" },
    "Overdue": { className: "bg-destructive/10 border-destructive/50 text-destructive" },
  };
  
  const { className } = config[status as keyof typeof config] || config["On Track"];
  
  return (
    <Badge variant="secondary" className={`rounded-md px-2.5 py-1 font-medium text-[10px] ${className}`}>
      {status}
    </Badge>
  );
}

export function PendingSettlements() {
  const totalPending = settlements.reduce((sum, s) => sum + s.amount, 0);
  const totalOrders = settlements.reduce((sum, s) => sum + s.orders, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <DollarSign className="size-4 text-muted-foreground" />
          Pending Courier Settlements
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          View All <ArrowRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <div className="text-2xl font-semibold leading-none tracking-tight">${totalPending.toLocaleString()}</div>
              <div className="text-muted-foreground text-xs">Total Pending</div>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <div className="text-lg font-semibold leading-none tracking-tight">{totalOrders}</div>
              <div className="text-muted-foreground text-xs">Orders</div>
            </div>
          </div>
          <Badge variant="outline" className="flex items-center gap-1 text-[10px]">
            <Clock className="size-3" />
            Avg. 7.2 days pending
          </Badge>
        </div>

        <div className="flex flex-col divide-y divide-border">
          {settlements.map((item) => (
            <div key={item.courier} className="grid grid-cols-[1fr_auto_auto] gap-3 py-3 first:pt-0 last:pb-0 items-center">
              <div>
                <div className="font-medium text-sm">{item.courier}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{item.orders} orders</span>
                  <span>•</span>
                  <span>Pending {item.pendingSince}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold">${item.amount.toFixed(2)}</div>
                <div className="text-muted-foreground text-xs">Due {item.expectedDate}</div>
              </div>
              <StatusBadge status={item.status} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}