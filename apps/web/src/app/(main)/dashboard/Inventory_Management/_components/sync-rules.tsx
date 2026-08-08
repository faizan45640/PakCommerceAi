// sync-rules.tsx
"use client";

import { ArrowRight, CheckCircle, XCircle, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const syncRules = [
  { product: "T-Shirt - All Sizes", sku: "TS-ALL", stores: ["Main Store", "Partner Store A"], excluded: [] },
  { product: "Jeans - 32", sku: "JN-32-002", stores: ["Main Store", "Partner Store A", "Partner Store B"], excluded: [] },
  { product: "Sneakers - 10", sku: "SN-10-003", stores: ["Main Store", "Marketplace X"], excluded: ["Partner Store B"] },
  { product: "Jacket - M", sku: "JK-M-004", stores: ["Main Store"], excluded: ["Partner Store A", "Partner Store B", "Marketplace X"] },
  { product: "Hat - One Size", sku: "HT-OS-005", stores: ["Main Store", "Partner Store A", "Partner Store B", "Marketplace X"], excluded: [] },
  { product: "Scarf - Red", sku: "SC-R-006", stores: ["Main Store"], excluded: ["Partner Store A", "Partner Store B"] },
];

function StoreList({ stores, type }: { stores: string[]; type: "synced" | "excluded" }) {
  if (stores.length === 0) {
    return <span className="text-xs text-muted-foreground">All stores</span>;
  }
  
  return (
    <div className="flex flex-wrap gap-1">
      {stores.map((store) => (
        <Badge 
          key={store} 
          variant={type === "synced" ? "secondary" : "destructive"}
          className="text-[10px]"
        >
          {store}
        </Badge>
      ))}
    </div>
  );
}

export function SyncRules() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Selective Sync Rules</CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          <Button variant="ghost" size="sm" className="h-auto gap-1 px-2 py-1 text-xs">
            <Plus className="size-3" />
            Add Rule
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {syncRules.map((rule) => (
          <div key={rule.sku} className="space-y-1 border-b pb-3 last:border-0 last:pb-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{rule.product}</span>
                <Badge variant="outline" className="text-[10px] font-mono">{rule.sku}</Badge>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <CheckCircle className="size-3 text-green-500" />
                <span className="text-muted-foreground">{rule.stores.length} store{rule.stores.length !== 1 ? "s" : ""}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Synced:</span>
                <StoreList stores={rule.stores} type="synced" />
              </div>
              {rule.excluded.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Excluded:</span>
                  <StoreList stores={rule.excluded} type="excluded" />
                </div>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}