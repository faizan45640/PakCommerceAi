"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";
import type { OrderDetail } from "@pakcommerce/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchOrderById } from "@/lib/api/orders";
import { fetchCurrentWorkspace } from "@/lib/api/products";
import { formatPkr } from "@/lib/currency";

import { OrderChannelBadge, OrderStatusBadge, shortOrderId } from "../../_components/order-badges";
import { OrderActions } from "./order-actions-panel";
import { OrderCustomerPanel } from "./order-customer-panel";
import { OrderStatusTimeline } from "./order-status-timeline";
import { OrderStockWarnings } from "./order-stock-warnings";

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-medium text-sm">{value}</span>
    </div>
  );
}

export function OrderDetailView({ id }: { id: string }) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const workspace = await fetchCurrentWorkspace();
        const data = await fetchOrderById(workspace.id, id);
        if (!ignore) {
          setWorkspaceId(workspace.id);
          setOrder(data);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setErrorMessage(err instanceof Error ? err.message : "Failed to load order.");
        }
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [id]);

  const handleUpdated = useCallback((updated: OrderDetail) => setOrder(updated), []);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse" aria-busy="true">
        <div className="h-6 w-36 rounded-md bg-muted" />
        <div className="h-10 w-72 rounded-md bg-muted" />
        <div className="h-64 rounded-xl border bg-muted/20" />
      </div>
    );
  }

  if (errorMessage || !order || !workspaceId) {
    return (
      <div className="flex flex-col gap-6">
        <Link
          href="/dashboard/orders"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Orders
        </Link>
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-12 text-center">
          <AlertCircle className="size-10 text-destructive" />
          <h2 className="font-semibold text-lg">Order Not Found</h2>
          <p className="max-w-md text-muted-foreground text-sm">
            {errorMessage ?? "The requested order does not exist in this workspace."}
          </p>
          <Button asChild className="mt-2">
            <Link href="/dashboard/orders">Return to Orders</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/dashboard/orders"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Orders
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-semibold text-2xl tracking-tight">Order {shortOrderId(order.id)}</h1>
            <OrderStatusBadge status={order.status} />
            <OrderChannelBadge channel={order.channel} />
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <Meta label="Payment" value={order.paymentMethod === "cod" ? "Cash on delivery" : "Prepaid"} />
            <Meta label="Created" value={formatDateTime(order.createdAt)} />
            {order.confirmedAt ? <Meta label="Confirmed" value={formatDateTime(order.confirmedAt)} /> : null}
            {order.cancelledAt ? <Meta label="Cancelled" value={formatDateTime(order.cancelledAt)} /> : null}
          </div>
        </div>
        <OrderActions order={order} workspaceId={workspaceId} onUpdated={handleUpdated} />
      </div>

      {order.status === "draft" ? <OrderStockWarnings checks={order.stockChecks} /> : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Line items</CardTitle>
              <CardDescription>
                {order.items.length} line{order.items.length === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader className="bg-muted/15">
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit price</TableHead>
                      <TableHead className="text-right">Line total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{item.title}</div>
                          {item.variantTitle ? (
                            <div className="text-muted-foreground text-xs">{item.variantTitle}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{item.sku || "—"}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">{formatPkr(item.unitPrice.amountMinor)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatPkr(item.lineTotal.amountMinor)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <dl className="ml-auto flex w-full max-w-xs flex-col gap-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd>{formatPkr(order.subtotal.amountMinor)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Shipping</dt>
                  <dd>{formatPkr(order.shippingFee.amountMinor)}</dd>
                </div>
                <div className="flex justify-between border-t pt-1.5 font-semibold">
                  <dt>Total</dt>
                  <dd>{formatPkr(order.total.amountMinor)}</dd>
                </div>
              </dl>
              {order.note ? (
                <p className="rounded-md bg-muted/40 p-3 text-muted-foreground text-sm">Note: {order.note}</p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <OrderCustomerPanel
            customer={order.customer}
            customerId={order.customerId}
            workspaceId={workspaceId}
            orderVersion={`${order.status}:${order.updatedAt}`}
            isDraft={order.status === "draft"}
          />
          <OrderStatusTimeline history={order.statusHistory} formatDateTime={formatDateTime} />
        </div>
      </div>
    </div>
  );
}
