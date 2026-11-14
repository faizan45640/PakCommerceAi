import Link from "next/link";
import type { CustomerDetail } from "@pakcommerce/shared";
import { format, parseISO } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPkr } from "@/lib/currency";

import { OrderStatusBadge, shortOrderId } from "../../../orders/_components/order-badges";

export function CustomerOrderHistory({ customer }: { customer: CustomerDetail }) {
  const { recentOrders, summary } = customer;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order history</CardTitle>
        <CardDescription>
          {recentOrders.length < summary.totalOrderCount
            ? `Latest ${recentOrders.length} of ${summary.totalOrderCount} orders`
            : `${summary.totalOrderCount} order${summary.totalOrderCount === 1 ? "" : "s"}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {recentOrders.length === 0 ? (
          <p className="text-muted-foreground text-sm">No orders yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/15">
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link href={`/dashboard/orders/${order.id}`} className="font-medium hover:underline">
                        {shortOrderId(order.id)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatPkr(order.total.amountMinor)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {format(parseISO(order.createdAt), "MMM d, yyyy")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {summary.totalOrderCount > 0 ? (
          <Button asChild variant="outline" size="sm" className="w-fit">
            <Link href={`/dashboard/orders?customerId=${customer.id}`}>View all orders</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
