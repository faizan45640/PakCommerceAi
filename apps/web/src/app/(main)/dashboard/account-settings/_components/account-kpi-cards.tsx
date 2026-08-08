// account-kpi-cards.tsx
import { ArrowUpRight, CheckCircle, Store, Users, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

export function AccountKpiCards() {
  return (
    <section className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Connected Stores</CardDescription>
            <CardAction>
              <Store className="size-4 text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-3xl leading-none tracking-tight">6</span>
              <Badge
                variant="outline"
                className="border-green-200 bg-green-500/10 text-green-700 dark:border-green-900/40 dark:bg-green-500/15 dark:text-green-300"
              >
                <CheckCircle className="size-3 mr-1" />
                All Active
              </Badge>
            </div>
            <p className="text-sm">
              <span className="font-medium text-foreground">4</span>{" "}
              <span className="text-muted-foreground">channels, 2 marketplaces</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Active Notifications</CardDescription>
            <CardAction>
              <Zap className="size-4 text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-3xl leading-none tracking-tight">23</span>
              <Badge
                variant="outline"
                className="border-yellow-200 bg-yellow-500/10 text-yellow-700 dark:border-yellow-900/40 dark:bg-yellow-500/15 dark:text-yellow-300"
              >
                <ArrowUpRight />
                +5 new
              </Badge>
            </div>
            <p className="text-sm">
              <span className="font-medium text-foreground">8</span>{" "}
              <span className="text-muted-foreground">need your attention</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Language Preference</CardDescription>
            <CardAction>
              <Users className="size-4 text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-3xl leading-none tracking-tight">English</span>
            </div>
            <p className="text-sm">
              <span className="text-muted-foreground">Switch language anytime</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Data Privacy Status</CardDescription>
            <CardAction>
              <CheckCircle className="size-4 text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-3xl leading-none tracking-tight">Secure</span>
            </div>
            <p className="text-sm">
              <span className="font-medium text-foreground">128</span>{" "}
              <span className="text-muted-foreground">customers opted-in</span>
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}