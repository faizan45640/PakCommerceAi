"use client";

import * as React from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import type { Conversation } from "@pakcommerce/shared/conversations";
import type { CustomerContext } from "@pakcommerce/shared/customers";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchConversationById } from "@/lib/api/conversations";
import { fetchCustomerContext } from "@/lib/api/customers";
import { fetchCurrentWorkspace } from "@/lib/api/products";
import { formatPkr } from "@/lib/currency";

import { CustomerLink } from "../../customers/_components/customer-link";
import { customerProfileHref } from "../../customers/_components/customer-links";
import { CustomerTagList } from "../../customers/_components/customer-tag-badge";
import { OrderStatusBadge, shortOrderId } from "../../orders/_components/order-badges";
import { customerLookupFor, customerLookupKey, orderCountLabel } from "./conversation-customer-panel-model";

type Loaded = { id: string; workspaceId: string; conversation: Conversation } | { id: string; error: true };
type Looked = { key: string; context: CustomerContext } | { key: string; error: true };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/** Customer 360 summary beside the selected conversation. */
export function ConversationCustomerPanel({
  conversationId,
  updatedConversation,
}: {
  conversationId?: string;
  /** A row the thread changed; used when it is this conversation (e.g. it got linked). */
  updatedConversation?: Conversation | null;
}) {
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);
  const [looked, setLooked] = React.useState<Looked | null>(null);
  const [attempt, setAttempt] = React.useState(0);

  // Load the selected conversation (for customerId + phone).
  React.useEffect(() => {
    if (!conversationId) return;
    let ignore = false;
    (async () => {
      try {
        const workspace = await fetchCurrentWorkspace();
        const conversation = await fetchConversationById(workspace.id, conversationId);
        if (!ignore) setLoaded({ id: conversationId, workspaceId: workspace.id, conversation });
      } catch {
        if (!ignore) setLoaded({ id: conversationId, error: true });
      }
    })();
    return () => {
      ignore = true;
    };
  }, [conversationId, attempt]);

  const base = loaded && loaded.id === conversationId ? loaded : null;
  // A fresher row from the thread (e.g. the chat just got linked) wins.
  const conversation =
    updatedConversation && updatedConversation.id === conversationId
      ? updatedConversation
      : base && !("error" in base)
        ? base.conversation
        : null;
  const workspaceId = base && !("error" in base) ? base.workspaceId : null;
  const lookup = conversation ? customerLookupFor(conversation) : null;
  const key = lookup ? customerLookupKey(lookup) : null;
  const customerId = lookup && "customerId" in lookup ? lookup.customerId : undefined;
  const phone = lookup && "phone" in lookup ? lookup.phone : undefined;

  // Look the customer up; re-runs when the lookup changes. Results are keyed, so a stale one is never shown.
  React.useEffect(() => {
    if (!workspaceId || !key) return;
    let ignore = false;
    const target = customerId ? { customerId } : { phone: phone ?? "" };
    fetchCustomerContext(workspaceId, target)
      .then((context) => {
        if (!ignore) setLooked({ key, context });
      })
      .catch(() => {
        if (!ignore) setLooked({ key, error: true });
      });
    return () => {
      ignore = true;
    };
  }, [workspaceId, key, customerId, phone, attempt]);

  if (!conversationId) return null;

  const result = looked && looked.key === key ? looked : null;
  const failed = (base && "error" in base) || (result && "error" in result);
  const retry = () => {
    setLoaded(null);
    setLooked(null);
    setAttempt((n) => n + 1);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer</CardTitle>
      </CardHeader>
      <CardContent>
        {failed ? (
          <div className="flex flex-col items-start gap-2 text-sm">
            <p className="text-destructive">Could not load the customer.</p>
            <Button variant="outline" size="sm" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : !result || "error" in result ? (
          <p className="text-muted-foreground text-sm">Loading customer…</p>
        ) : result.context.found ? (
          <FoundCustomer context={result.context} />
        ) : (
          <div className="flex flex-col gap-1 text-sm">
            <p className="font-medium">New buyer — no orders yet</p>
            <p className="text-muted-foreground">{conversation?.buyerPhone}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FoundCustomer({ context }: { context: Extract<CustomerContext, { found: true }> }) {
  const { customer, summary, tags, riskNotes, recentOrders } = context;
  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-3">
        <Row label="Name">
          <CustomerLink customerId={customer.id} className="font-medium">
            {customer.name}
          </CustomerLink>
        </Row>
        <Row label="Phone">{customer.phone}</Row>
        <Row label="Tags">
          <CustomerTagList tags={tags} />
        </Row>
        <Row label="Orders">{orderCountLabel(summary.totalOrderCount, summary.completedOrderCount)}</Row>
        <Row label="Completed spend">{formatPkr(summary.lifetimeSpend.amountMinor)}</Row>
        <Row label="Returns">{summary.returnedOrderCount}</Row>
        <Row label="Last order">
          {summary.lastOrderAt ? format(parseISO(summary.lastOrderAt), "MMM d, yyyy") : "—"}
        </Row>
        {riskNotes.length > 0 ? (
          <Row label="Latest risk note">
            <span className="text-destructive">{riskNotes[0].body}</span>
          </Row>
        ) : null}
      </dl>

      {recentOrders.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs">Recent orders</p>
          <ul className="flex flex-col gap-1.5">
            {recentOrders.slice(0, 3).map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/dashboard/orders/${order.id}`} className="font-medium hover:underline">
                  {shortOrderId(order.id)}
                </Link>
                <OrderStatusBadge status={order.status} />
                <span className="text-muted-foreground">{formatPkr(order.total.amountMinor)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Button asChild variant="outline" size="sm">
        <Link href={customerProfileHref({ customerId: customer.id })}>View customer profile</Link>
      </Button>
    </div>
  );
}
