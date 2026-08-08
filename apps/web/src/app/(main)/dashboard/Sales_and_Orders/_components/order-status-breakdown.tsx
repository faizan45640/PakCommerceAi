// order-status-breakdown.tsx
"use client";

import { ArrowRight, CheckCircle, Clock, Package, PackageCheck, PackageX, Truck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const orderStatusData = [
  { status: "Pending", count: 132, icon: Clock, color: "bg-yellow-500" },
  { status: "Confirmed", count: 89, icon: CheckCircle, color: "bg-blue-500" },
  { status: "Shipped", count: 456, icon: Truck, color: "bg-purple-500" },
  { status: "Delivered", count: 892, icon: PackageCheck, color: "bg-green-500" },
  { status: "Returned", count: 67, icon: Package, color: "bg-orange-500" },
  { status: "Cancelled", count: 211, icon: PackageX, color: "bg-destructive" },
];

const totalOrders = orderStatusData.reduce((sum, item) => sum + item.count, 0);

export function OrderStatusBreakdown() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Package className="size-4 text-muted-foreground" />
          Order Status Breakdown
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          View All Orders <ArrowRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-semibold leading-none tracking-tight">{totalOrders}</div>
            <div className="text-muted-foreground text-xs">Total Orders</div>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {((orderStatusData.find(d => d.status === "Delivered")?.count || 0) / totalOrders * 100).toFixed(1)}% delivered
          </Badge>
        </div>

        <div className="space-y-2.5">
          {orderStatusData.map((item) => {
            const percentage = (item.count / totalOrders * 100);
            const Icon = item.icon;
            
            return (
              <div key={item.status} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Icon className="size-3.5 text-muted-foreground" />
                    <span className="font-medium">{item.status}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.count}</span>
                    <span className="text-muted-foreground">({percentage.toFixed(1)}%)</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${item.color}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}