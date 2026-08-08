"use client";

import { ArrowDown, ArrowUp, Boxes, Package, ShoppingCart, Store, Info, AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function InventoryKpiCards() {
  return (
    <section className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Total Products</CardTitle>
            <CardAction>
              <Info className="size-3 text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="text-3xl text-foreground leading-none tracking-tight">3,247</div>
            <div className="mt-1 text-right text-muted-foreground text-xs">across 4 stores</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Total Stock Value</CardTitle>
            <CardAction>
              <Info className="size-3 text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="text-3xl text-foreground leading-none tracking-tight">$184.2K</div>
            <div className="mt-1 flex items-center justify-end gap-1">
              <Badge className="rounded-sm border-green-600/50 bg-green-500/10 px-1 font-normal text-green-700 text-xs dark:border-green-800/50 dark:bg-green-500/15 dark:text-green-300">
                <ArrowUp className="size-3" />
                3.2%
              </Badge>
              <span className="text-muted-foreground text-xs">vs last month</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1 text-sm">
              Low Stock Items
              <AlertTriangle className="size-3 text-yellow-500" />
            </CardTitle>
            <CardAction>
              <Info className="size-3 text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="text-3xl text-foreground leading-none tracking-tight">23</div>
            <div className="mt-1 text-right text-muted-foreground text-xs">12 below threshold</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1 text-sm">
              Overselling Alerts
              <AlertTriangle className="size-3 text-destructive" />
            </CardTitle>
            <CardAction>
              <Info className="size-3 text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="text-3xl text-destructive leading-none tracking-tight">5</div>
            <div className="mt-1 text-right text-muted-foreground text-xs">3 critical · 2 warning</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Sync Status</CardTitle>
            <CardAction>
              <Info className="size-3 text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-3xl text-green-600 leading-none tracking-tight">4/6</span>
              <span className="text-sm text-muted-foreground">stores synced</span>
            </div>
            <div className="mt-1 text-right text-muted-foreground text-xs">2 pending · 0 failed</div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}