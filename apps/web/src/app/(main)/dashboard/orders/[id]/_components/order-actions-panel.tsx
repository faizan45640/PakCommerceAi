"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { OrderDetail, OrderStatus } from "@pakcommerce/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiRequestError } from "@/lib/api/api-client";
import { fetchOrderById, transitionOrder } from "@/lib/api/orders";

import { canOfferTransition, confirmBlockers } from "./order-actions";

function describeError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    const details = error.details ? Object.values(error.details).flat() : [];
    return details.length > 0 ? `${error.message} ${details.join(" ")}` : error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function OrderActions({
  order,
  workspaceId,
  onUpdated,
}: {
  order: OrderDetail;
  workspaceId: string;
  onUpdated: (order: OrderDetail) => void;
}) {
  const [pending, setPending] = useState<OrderStatus | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = canOfferTransition(order, "confirmed");
  const canCancel = canOfferTransition(order, "cancelled");
  if (!canConfirm && !canCancel) return null;

  const blockers = confirmBlockers(order);

  async function run(toStatus: OrderStatus) {
    setPending(toStatus);
    setError(null);
    try {
      onUpdated(await transitionOrder(workspaceId, order.id, toStatus));
      toast.success(toStatus === "confirmed" ? "Order confirmed" : "Order cancelled");
      setCancelOpen(false);
    } catch (err: unknown) {
      const message = describeError(err);
      setError(message);
      setCancelOpen(false);
      toast.error(message);
      // Stock or address may have changed under us: refresh the warnings.
      try {
        onUpdated(await fetchOrderById(workspaceId, order.id));
      } catch {
        /* keep the error message; the page still shows the last good data */
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex gap-2">
        {canCancel ? (
          <Button variant="outline" disabled={pending !== null} onClick={() => setCancelOpen(true)}>
            Cancel order
          </Button>
        ) : null}
        {canConfirm ? (
          <Button disabled={pending !== null || blockers.length > 0} onClick={() => void run("confirmed")}>
            {pending === "confirmed" ? <Loader2 className="animate-spin" /> : null}
            Confirm order
          </Button>
        ) : null}
      </div>
      {canConfirm && blockers.length > 0 ? (
        <p className="max-w-xs text-muted-foreground text-xs sm:text-right">{blockers.join(" ")}</p>
      ) : null}
      {error ? (
        <p role="alert" className="max-w-xs text-destructive text-xs sm:text-right">
          {error}
        </p>
      ) : null}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel this order?</DialogTitle>
            <DialogDescription>
              The draft will be marked cancelled. Stock is not changed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={pending !== null}>
              Keep order
            </Button>
            <Button variant="destructive" onClick={() => void run("cancelled")} disabled={pending !== null}>
              {pending === "cancelled" ? <Loader2 className="animate-spin" /> : null}
              Cancel order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
