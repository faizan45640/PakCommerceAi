// page.tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { LogisticsKpiStrip } from "./_components/logistics-kpi-strip";
import { LogisticsToolbar } from "./_components/logistics-toolbar";
import { CourierAssignedOrders } from "./_components/courier-assigned-orders";
import { CodCollection } from "./_components/cod-collection";
import { RtoCount } from "./_components/rto-count";
import { CodRiskScore } from "./_components/cod-risk-score";
import { CourierPerformance } from "./_components/courier-performance";
import { PendingSettlements } from "./_components/pending-settlements";
import { ReturnRateAnalysis } from "./_components/return-rate-analysis";

export default function LogisticsDashboardPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <h1 className="text-3xl tracking-tight">Courier, COD & Logistics</h1>
        <p className="text-muted-foreground text-sm">
          Track deliveries, manage COD collections, and monitor courier performance across all orders.
        </p>
      </div>

      <Tabs defaultValue="overview" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="couriers">Couriers</TabsTrigger>
            <TabsTrigger value="settlements">Settlements</TabsTrigger>
            <TabsTrigger value="returns">Returns</TabsTrigger>
          </TabsList>

          <LogisticsToolbar />
        </div>

        <TabsContent value="overview" className="flex flex-col gap-4">
          <LogisticsKpiStrip />

          <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-12">
            <div className="xl:col-span-7">
              <CourierAssignedOrders />
            </div>
            <div className="xl:col-span-5">
              <CodCollection />
            </div>
          </div>

          <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-12">
            <div className="xl:col-span-5">
              <RtoCount />
            </div>
            <div className="xl:col-span-7">
              <CodRiskScore />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="orders" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 items-stretch gap-4">
            <CourierAssignedOrders />
          </div>
        </TabsContent>

        <TabsContent value="couriers" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 items-stretch gap-4">
            <CourierPerformance />
          </div>
        </TabsContent>

        <TabsContent value="settlements" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 items-stretch gap-4">
            <PendingSettlements />
          </div>
        </TabsContent>

        <TabsContent value="returns" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 items-stretch gap-4">
            <ReturnRateAnalysis />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}