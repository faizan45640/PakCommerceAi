// agent-kpi-strip.tsx
import { ArrowUpRight, Ellipsis } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AgentKpiStrip() {
  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-foreground/10">
      <div className="grid divide-y *:data-[slot=card]:rounded-none *:data-[slot=card]:ring-0 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-5">
        <Card>
          <CardHeader>
            <CardTitle className="font-normal text-sm">Total Conversations</CardTitle>
            <CardAction>
              <Ellipsis className="size-4" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div className="text-2xl leading-none tracking-tight">2,847</div>
              <Badge className="bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-300">
                <ArrowUpRight />
                18.4%
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <span>
                from <span className="text-foreground">2,404</span>
              </span>
              <span>•</span>
              <span>last 30 days</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-normal text-sm">Orders Generated</CardTitle>
            <CardAction>
              <Ellipsis className="size-4" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div className="text-2xl leading-none tracking-tight">1,247</div>
              <Badge className="bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-300">
                <ArrowUpRight />
                12.3%
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <span>
                from <span className="text-foreground">1,110</span>
              </span>
              <span>•</span>
              <span>43.8% conversion rate</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-normal text-sm">Draft Orders</CardTitle>
            <CardAction>
              <Ellipsis className="size-4" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div className="text-2xl leading-none tracking-tight">86</div>
              <Badge className="bg-yellow-500/10 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300">
                <ArrowUpRight />
                8.2%
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <span>
                from <span className="text-foreground">79</span>
              </span>
              <span>•</span>
              <span>awaiting approval</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-normal text-sm">Human Handoff Alerts</CardTitle>
            <CardAction>
              <Ellipsis className="size-4" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div className="text-2xl leading-none tracking-tight">23</div>
              <Badge className="bg-destructive/10 text-destructive">
                <ArrowUpRight />
                15.0%
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <span>
                from <span className="text-foreground">20</span>
              </span>
              <span>•</span>
              <span>need your attention</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-normal text-sm">Agent Confidence</CardTitle>
            <CardAction>
              <Ellipsis className="size-4" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div className="text-2xl leading-none tracking-tight">87.6%</div>
              <Badge className="bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-300">
                <ArrowUpRight />
                2.4%
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <span>
                from <span className="text-foreground">85.2%</span>
              </span>
              <span>•</span>
              <span>last 30 days</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}