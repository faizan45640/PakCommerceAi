import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { OrderStockCheck } from "@pakcommerce/shared";

export function OrderStockWarnings({ checks }: { checks: OrderStockCheck[] }) {
  const short = checks.filter((check) => !check.sufficient);

  if (short.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-4 py-2.5 text-muted-foreground text-sm">
        <CheckCircle2 className="size-4 text-emerald-600" />
        Stock is available for every line.
      </div>
    );
  }

  return (
    <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex items-center gap-2 font-semibold text-amber-800 text-sm dark:text-amber-300">
        <AlertTriangle className="size-4" />
        Not enough stock to confirm this order
      </div>
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {short.map((check, index) => (
          <li key={`${check.variantId}-${index}`}>
            <span className="font-medium">
              {check.title}
              {check.variantTitle ? ` (${check.variantTitle})` : ""}
            </span>
            : needs {check.needed}, available {check.available ?? 0}
          </li>
        ))}
      </ul>
    </div>
  );
}
