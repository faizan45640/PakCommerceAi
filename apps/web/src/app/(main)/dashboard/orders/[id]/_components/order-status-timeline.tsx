import type { OrderStatusHistory } from "@pakcommerce/shared";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { ORDER_STATUS_LABELS } from "../../_components/order-badges";

export function OrderStatusTimeline({
  history,
  formatDateTime,
}: {
  history: OrderStatusHistory[];
  formatDateTime: (iso: string) => string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Status timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-muted-foreground text-sm">No status changes recorded.</p>
        ) : (
          <ol className="flex flex-col gap-4 border-l pl-4">
            {history.map((entry) => (
              <li key={entry.id} className="relative">
                <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background bg-primary" />
                <div className="font-medium text-sm">
                  {entry.fromStatus
                    ? `${ORDER_STATUS_LABELS[entry.fromStatus]} → ${ORDER_STATUS_LABELS[entry.toStatus]}`
                    : `Created as ${ORDER_STATUS_LABELS[entry.toStatus]}`}
                </div>
                <div className="text-muted-foreground text-xs">{formatDateTime(entry.createdAt)}</div>
                {entry.note ? <div className="mt-1 text-sm">{entry.note}</div> : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
