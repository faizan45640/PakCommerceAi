import type { CustomerSummary } from "@pakcommerce/shared";
import { format, parseISO } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPkr } from "@/lib/currency";

function Stat({ title, value, helper }: { title: string; value: React.ReactNode; helper?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-medium text-muted-foreground text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <div className="font-semibold text-2xl tracking-tight">{value}</div>
        {helper ? <div className="text-muted-foreground text-xs">{helper}</div> : null}
      </CardContent>
    </Card>
  );
}

function day(iso: string | null): string {
  return iso ? format(parseISO(iso), "MMM d, yyyy") : "—";
}

export function CustomerOverviewCards({ summary }: { summary: CustomerSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        title="Lifetime spend"
        value={formatPkr(summary.lifetimeSpend.amountMinor)}
        helper="Confirmed, shipped and delivered orders"
      />
      <Stat
        title="Orders"
        value={`${summary.completedOrderCount}/${summary.totalOrderCount}`}
        helper="Completed / total"
      />
      <Stat
        title="Average order value"
        value={summary.averageOrderValue ? formatPkr(summary.averageOrderValue.amountMinor) : "—"}
        helper="Across completed orders"
      />
      <Stat
        title="First / last order"
        value={<span className="text-lg">{day(summary.firstOrderAt)}</span>}
        helper={`Last: ${day(summary.lastOrderAt)}`}
      />
    </div>
  );
}
