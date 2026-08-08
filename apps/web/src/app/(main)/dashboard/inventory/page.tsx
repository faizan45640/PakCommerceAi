// page.tsx
import { Plus, RefreshCw, Settings } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";

import { InventoryKpiCards } from "./_components/inventory-kpi-cards";
import { InventoryStockLevels } from "./_components/inventory-stock-levels";
import { LowStockAlerts } from "./_components/low-stock-alerts";
import { OversellingFlags } from "./_components/overselling-flags";
import { PartnerAccessLog } from "./_components/partner-access-log";
import { StockHistory } from "./_components/stock-history";
import { SyncRules } from "./_components/sync-rules";
import { SyncStatus } from "./_components/sync-status";

export default function InventoryDashboardPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Inventory"
        description="Manage stock levels and multi-store sync across connected channels."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">
              <RefreshCw className="size-4" />
              Sync All Stores
            </Button>
            <Button size="sm" variant="outline">
              <Settings className="size-4" />
              Settings
            </Button>
            <Button size="sm" variant="outline">
              <Plus className="size-4" />
              Add Product
            </Button>
          </div>
        }
      />

      <InventoryKpiCards />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <InventoryStockLevels />
        </div>
        <div className="xl:col-span-5">
          <SyncStatus />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-5">
          <LowStockAlerts />
        </div>
        <div className="xl:col-span-7">
          <OversellingFlags />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-6">
          <SyncRules />
        </div>
        <div className="xl:col-span-6">
          <PartnerAccessLog />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <StockHistory />
      </div>
    </div>
  );
}