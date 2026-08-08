// cod-risk-score.tsx
"use client";

import { ArrowRight, Shield, ShieldAlert, ShieldCheck } from "lucide-react";

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

const riskOrders = [
  {
    orderId: "ORD-2024-0042",
    customer: "James Wilson",
    amount: 124.50,
    city: "Mumbai",
    returns: 2,
    score: "Medium",
    risk: "medium",
  },
  {
    orderId: "ORD-2024-0058",
    customer: "David Kim",
    amount: 189.99,
    city: "Delhi",
    returns: 4,
    score: "High",
    risk: "high",
  },
  {
    orderId: "ORD-2024-0038",
    customer: "Sarah Chen",
    amount: 89.99,
    city: "Bangalore",
    returns: 0,
    score: "Low",
    risk: "low",
  },
  {
    orderId: "ORD-2024-0051",
    customer: "Mike Johnson",
    amount: 256.75,
    city: "Chennai",
    returns: 3,
    score: "High",
    risk: "high",
  },
  {
    orderId: "ORD-2024-0063",
    customer: "Priya Patel",
    amount: 67.30,
    city: "Hyderabad",
    returns: 1,
    score: "Medium",
    risk: "medium",
  },
  {
    orderId: "ORD-2024-0071",
    customer: "Alex Turner",
    amount: 312.50,
    city: "Kolkata",
    returns: 5,
    score: "High",
    risk: "high",
  },
];

function RiskBadge({ risk, score }: { risk: string; score: string }) {
  const config = {
    low: { icon: ShieldCheck, className: "bg-green-500/10 border-green-600/50 text-green-700 dark:text-green-300" },
    medium: { icon: Shield, className: "bg-yellow-500/10 border-yellow-600/50 text-yellow-700 dark:text-yellow-300" },
    high: { icon: ShieldAlert, className: "bg-destructive/10 border-destructive/50 text-destructive" },
  };
  
  const { icon: Icon, className } = config[risk as keyof typeof config] || config.low;
  
  return (
    <Badge variant="secondary" className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium text-[10px] ${className}`}>
      <Icon className="size-3" />
      {score}
    </Badge>
  );
}

export function CodRiskScore() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldAlert className="size-4 text-muted-foreground" />
          COD Risk Score per Order
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          View All <ArrowRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <Table className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
          <TableHeader className="[&_tr]:border-border/50">
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-8">Order</TableHead>
              <TableHead className="h-8">Customer</TableHead>
              <TableHead className="h-8 text-right">Amount</TableHead>
              <TableHead className="h-8">City</TableHead>
              <TableHead className="h-8 text-center">Returns</TableHead>
              <TableHead className="h-8">Risk</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="[&_tr]:border-border/50">
            {riskOrders.map((order) => (
              <TableRow className="hover:bg-transparent" key={order.orderId}>
                <TableCell className="font-medium text-sm">{order.orderId}</TableCell>
                <TableCell>{order.customer}</TableCell>
                <TableCell className="text-right font-medium">${order.amount.toFixed(2)}</TableCell>
                <TableCell className="text-muted-foreground">{order.city}</TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className="text-[10px]">
                    {order.returns}
                  </Badge>
                </TableCell>
                <TableCell>
                  <RiskBadge risk={order.risk} score={order.score} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}