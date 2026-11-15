"use client";

import * as React from "react";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import type { Conversation } from "@pakcommerce/shared/conversations";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ApiRequestError } from "@/lib/api/api-client";
import { decideOrderApproval, fetchConversationById, type OrderApprovalDecision } from "@/lib/api/conversations";
import { fetchOrderById, fetchOrders, type OrderDetailWithAi } from "@/lib/api/orders";
import { fetchCurrentWorkspace } from "@/lib/api/products";
import { formatPkr } from "@/lib/currency";

import { shortOrderId } from "../../orders/_components/order-badges";
import { approvalSuccessMessage, isStaleApproval, pickPendingDraft } from "./conversation-orders-model";

type Draft = { workspaceId: string; order: OrderDetailWithAi | null };

/**
 * Shown while a conversation is `waiting_approval`: the AI's draft order with Approve / Reject.
 * `onDecided` gets the conversation the API returns (or the refetched one after a 409).
 */
export function OrderApprovalCard({
  conversation,
  onDecided,
}: {
  conversation: Conversation;
  onDecided: (conversation: Conversation) => void;
}) {
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<OrderApprovalDecision | null>(null);
  const [confirmingReject, setConfirmingReject] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const workspace = await fetchCurrentWorkspace();
        const list = await fetchOrders({
          workspaceId: workspace.id,
          conversationId: conversation.id,
          statuses: ["draft"],
          sort: "newest",
          limit: 20,
        });
        const found = pickPendingDraft(list.items);
        const order = found ? await fetchOrderById(workspace.id, found.id) : null;
        if (!ignore) {
          setDraft({ workspaceId: workspace.id, order });
          setError(null);
        }
      } catch {
        if (!ignore) setError("Could not load the draft order.");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [conversation.id, conversation.updatedAt, attempt]);

  async function decide(decision: OrderApprovalDecision) {
    if (!draft?.order || pending) return;
    setPending(decision);
    setError(null);
    try {
      const updated = await decideOrderApproval(draft.workspaceId, conversation.id, draft.order.id, decision);
      toast.success(approvalSuccessMessage(decision));
      setConfirmingReject(false);
      onDecided(updated);
    } catch (err) {
      if (isStaleApproval(err)) {
        // Someone else decided, or the draft changed: pull the latest state instead of failing.
        toast.info("This order was already handled. Refreshed.");
        setConfirmingReject(false);
        try {
          onDecided(await fetchConversationById(draft.workspaceId, conversation.id));
        } catch {
          setAttempt((n) => n + 1);
        }
      } else {
        setError(err instanceof ApiRequestError ? err.message : "Could not save your decision.");
      }
    } finally {
      setPending(null);
    }
  }

  const order = draft?.order ?? null;
  const customer = order?.customer;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <ClipboardCheck className="size-4 text-amber-600" />
        AI order waiting for your approval
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}

      {!draft && !error ? <p className="text-muted-foreground text-xs">Loading the draft order…</p> : null}

      {draft && !order ? (
        <p className="text-muted-foreground text-xs">No AI draft order found for this chat.</p>
      ) : null}

      {order ? (
        <>
          <div className="flex items-center justify-between gap-2 text-xs">
            <Link href={`/dashboard/orders/${order.id}`} className="font-medium hover:underline">
              Order {shortOrderId(order.id)}
            </Link>
            <span className="text-muted-foreground">
              {customer?.city}
              {customer?.addressLine ? `, ${customer.addressLine}` : ""}
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-2 text-xs">
                <span>
                  {item.quantity} × {item.title}
                  {item.variantTitle ? ` (${item.variantTitle})` : ""}
                </span>
                <span className="text-muted-foreground">{formatPkr(item.lineTotal.amountMinor)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t pt-1.5 font-semibold text-xs">
            <span>Total (incl. delivery {formatPkr(order.shippingFee.amountMinor)})</span>
            <span>{formatPkr(order.total.amountMinor)}</span>
          </div>

          {confirmingReject ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs">Reject cancels this order and takes over the chat. Continue?</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={pending !== null}
                  onClick={() => void decide("reject")}
                >
                  {pending === "reject" ? "Rejecting..." : "Yes, reject"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending !== null}
                  onClick={() => setConfirmingReject(false)}
                >
                  Keep order
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" disabled={pending !== null} onClick={() => void decide("approve")}>
                {pending === "approve" ? "Approving..." : "Approve"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending !== null}
                onClick={() => setConfirmingReject(true)}
              >
                Reject
              </Button>
            </div>
          )}
        </>
      ) : null}

      {error && !order ? (
        <Button size="sm" variant="outline" className="w-fit" onClick={() => setAttempt((n) => n + 1)}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
