import type { ProductListItem } from "@pakcommerce/shared";

import { MetricCard } from "@/components/dashboard/metric-card";

interface ProductKpiCardsProps {
  items: ProductListItem[];
  total: number;
}

export function ProductKpiCards({ items, total }: ProductKpiCardsProps) {
  const activeCount = items.filter((item) => item.status === "active").length;
  const lowStockCount = items.filter((item) => item.inventoryState === "low_stock").length;
  const outOfStockCount = items.filter((item) => item.inventoryState === "out_of_stock").length;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="Total Products"
        value={String(total)}
        helperText="Items in your central catalog"
      />
      <MetricCard
        label="Live for Sale"
        value={String(activeCount)}
        helperText="Active products available"
      />
      <MetricCard
        label="Low Stock Alerts"
        value={String(lowStockCount)}
        helperText="Restock recommended soon"
      />
      <MetricCard
        label="Out of Stock"
        value={String(outOfStockCount)}
        helperText="Unavailable for customers"
      />
    </div>
  );
}
