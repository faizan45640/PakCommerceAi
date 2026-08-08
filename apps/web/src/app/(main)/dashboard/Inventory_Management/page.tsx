// page.tsx
import { Boxes, Plus, RefreshCw, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";

import { InventoryKpiCards } from "./_components/inventory-kpi-cards";
import { InventoryStockLevels } from "./_components/inventory-stock-levels";
import { SyncStatus } from "./_components/sync-status";
import { LowStockAlerts } from "./_components/low-stock-alerts";
import { OversellingFlags } from "./_components/overselling-flags";
import { SyncRules } from "./_components/sync-rules";
import { PartnerAccessLog } from "./_components/partner-access-log";
import { StockHistory } from "./_components/stock-history";

export default function InventoryDashboardPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl tracking-tight">Inventory & Multi-Store Sync</h1>
          <p className="text-muted-foreground text-sm">
            Manage your inventory across all connected stores in real-time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:w-fit">
          <Button size="sm">
            <RefreshCw className="size-4" />
            Sync All Stores
          </Button>
          <Button size="sm" variant="outline">
            <Boxes className="size-4" />
            Bulk Actions
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
      </div>

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