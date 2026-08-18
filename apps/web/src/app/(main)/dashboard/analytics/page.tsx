import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge } from "@/components/dashboard/status-badge";

import { BestSellingProducts } from "../orders/_components/best-selling-products";
import { RevenueByChannel } from "../orders/_components/revenue-by-channel";
import { RevenueByCity } from "../orders/_components/revenue-by-city";
import { SalesTrendChart } from "../orders/_components/sales-trend-chart";

export default function AnalyticsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Analytics"
        description="Sales trends, channel mix, and city-level performance across your stores."
        actions={<StatusBadge label="Mock data" tone="neutral" />}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <SalesTrendChart />
        </div>
        <div className="xl:col-span-5">
          <BestSellingProducts />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-6">
          <RevenueByChannel />
        </div>
        <div className="xl:col-span-6">
          <RevenueByCity />
        </div>
      </div>
    </div>
  );
}
