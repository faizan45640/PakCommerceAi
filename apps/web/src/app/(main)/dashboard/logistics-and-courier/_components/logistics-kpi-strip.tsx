// logistics-kpi-strip.tsx
import { ArrowDownRight, ArrowUpRight, Ellipsis } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function LogisticsKpiStrip() {
  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-foreground/10">
      <div className="grid divide-y *:data-[slot=card]:rounded-none *:data-[slot=card]:ring-0 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-5">
        <Card>
          <CardHeader>
            <CardTitle className="font-normal text-sm">Total Orders</CardTitle>
            <CardAction>
              <Ellipsis className="size-4" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div className="text-2xl leading-none tracking-tight">1,847</div>
              <Badge className="bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-300">
                <ArrowUpRight />
                12.4%
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <span>
                from <span className="text-foreground">1,643</span>
              </span>
              <span>•</span>
              <span>last 30 days</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-normal text-sm">COD to Collect</CardTitle>
            <CardAction>
              <Ellipsis className="size-4" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div className="text-2xl leading-none tracking-tight">$42.8K</div>
              <Badge className="bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-300">
                <ArrowUpRight />
                8.3%
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <span>
                from <span className="text-foreground">$39.5K</span>
              </span>
              <span>•</span>
              <span>1,247 pending orders</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-normal text-sm">RTO Rate</CardTitle>
            <CardAction>
              <Ellipsis className="size-4" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div className="text-2xl leading-none tracking-tight">8.4%</div>
              <Badge className="bg-destructive/10 text-destructive">
                <ArrowUpRight />
                2.1%
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <span>
                from <span className="text-foreground">6.3%</span>
              </span>
              <span>•</span>
              <span>155 RTO orders</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-normal text-sm">Avg. Delivery Time</CardTitle>
            <CardAction>
              <Ellipsis className="size-4" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div className="text-2xl leading-none tracking-tight">3.2 days</div>
              <Badge className="bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-300">
                <ArrowDownRight />
                0.8 days
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <span>
                from <span className="text-foreground">4.0 days</span>
              </span>
              <span>•</span>
              <span>improving trend</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-normal text-sm">Pending Settlements</CardTitle>
            <CardAction>
              <Ellipsis className="size-4" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div className="text-2xl leading-none tracking-tight">$18.6K</div>
              <Badge className="bg-yellow-500/10 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300">
                <ArrowUpRight />
                5.2%
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <span>from <span className="text-foreground">12 couriers</span></span>
              <span>•</span>
              <span>avg. 7.2 days pending</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
