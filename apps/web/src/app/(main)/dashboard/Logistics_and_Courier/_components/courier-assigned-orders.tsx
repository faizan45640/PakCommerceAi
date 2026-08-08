// courier-assigned-orders.tsx
"use client";

import { ArrowRight, Truck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const orders = [
  {
    orderId: "ORD-2024-0042",
    customer: "James Wilson",
    courier: "BlueDart",
    tracking: "BD-8472-9123",
    status: "In Transit",
    codAmount: 124.50,
    eta: "2 days",
  },
  {
    orderId: "ORD-2024-0038",
    customer: "Sarah Chen",
    courier: "DTDC",
    tracking: "DT-5631-7845",
    status: "Delivered",
    codAmount: 89.99,
    eta: "Delivered",
  },
  {
    orderId: "ORD-2024-0051",
    customer: "Mike Johnson",
    courier: "Delhivery",
    tracking: "DH-3912-4567",
    status: "Out for Delivery",
    codAmount: 256.75,
    eta: "Today",
  },
  {
    orderId: "ORD-2024-0047",
    customer: "Emily Brown",
    courier: "BlueDart",
    tracking: "BD-7284-1934",
    status: "Pending",
    codAmount: 67.30,
    eta: "3 days",
  },
  {
    orderId: "ORD-2024-0058",
    customer: "David Kim",
    courier: "Shadowfax",
    tracking: "SF-4829-6721",
    status: "RTO Initiated",
    codAmount: 189.99,
    eta: "Returning",
  },
];

function StatusBadge({ status }: { status: string }) {
  const config = {
    "In Transit": { className: "bg-blue-500/10 border-blue-600/50 text-blue-700 dark:text-blue-300" },
    "Delivered": { className: "bg-green-500/10 border-green-600/50 text-green-700 dark:text-green-300" },
    "Out for Delivery": { className: "bg-yellow-500/10 border-yellow-600/50 text-yellow-700 dark:text-yellow-300" },
    "Pending": { className: "bg-gray-500/10 border-gray-600/50 text-gray-700 dark:text-gray-300" },
    "RTO Initiated": { className: "bg-destructive/10 border-destructive/50 text-destructive" },
  };
  
  const { className } = config[status as keyof typeof config] || config.Pending;
  
  return (
    <Badge variant="secondary" className={`rounded-md px-2.5 py-1 font-medium text-[10px] ${className}`}>
      {status}
    </Badge>
  );
}

export function CourierAssignedOrders() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Truck className="size-4 text-muted-foreground" />
          Courier Assigned Orders
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          View All Orders <ArrowRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <Table className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
          <TableHeader className="[&_tr]:border-border/50">
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-8">Order</TableHead>
              <TableHead className="h-8">Courier</TableHead>
              <TableHead className="h-8">Tracking</TableHead>
              <TableHead className="h-8 text-right">COD</TableHead>
              <TableHead className="h-8">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="[&_tr]:border-border/50">
            {orders.map((order) => (
              <TableRow className="hover:bg-transparent" key={order.orderId}>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-sm">{order.orderId}</span>
                    <span className="text-muted-foreground text-xs">{order.customer}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm">{order.courier}</span>
                    <span className="text-muted-foreground text-xs">{order.eta}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {order.tracking}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-medium">${order.codAmount.toFixed(2)}</TableCell>
                <TableCell>
                  <StatusBadge status={order.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}