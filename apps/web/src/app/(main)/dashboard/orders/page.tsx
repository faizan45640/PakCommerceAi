// page.tsx
import { PageHeader } from "@/components/dashboard/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { OrderStatusBreakdown } from "./_components/order-status-breakdown";
import { OrdersTable } from "./_components/orders-table/table";
import { PendingOrdersQueue } from "./_components/pending-orders-queue";
import { RecentOrdersList } from "./_components/recent-orders-list";
import { SalesKpiStrip } from "./_components/sales-kpi-strip";

export default function OrdersPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Orders"
        description="Track orders, pending work, and fulfillment status across connected channels."
      />

      <SalesKpiStrip />

      <Tabs defaultValue="overview" className="flex flex-col gap-4">
        <TabsList className="gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="orders">All Orders</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="xl:col-span-5">
              <OrderStatusBreakdown />
            </div>
            <div className="xl:col-span-7">
              <PendingOrdersQueue />
            </div>
          </div>

          <RecentOrdersList />
        </TabsContent>

        <TabsContent value="orders" className="flex flex-col gap-4">
          <OrdersTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}