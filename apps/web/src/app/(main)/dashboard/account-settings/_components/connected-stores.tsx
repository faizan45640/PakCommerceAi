// connected-stores.tsx
"use client";

import { ArrowRight, CheckCircle, Link2, Plug, XCircle, Zap } from "lucide-react";
import { siShopify, siWoo, siWhatsapp, siFacebook, siInstagram, siEbay } from "simple-icons";

import { SimpleIcon } from "@/components/simple-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const stores = [
  {
    id: 1,
    name: "Shopify Store",
    platform: "Shopify",
    icon: siShopify,
    status: "Connected",
    lastSync: "2 mins ago",
    products: 1245,
    orders: 847,
  },
  {
    id: 2,
    name: "WhatsApp Business",
    platform: "WhatsApp",
    icon: siWhatsapp,
    status: "Connected",
    lastSync: "5 mins ago",
    products: 892,
    orders: 312,
  },
  {
    id: 3,
    name: "WooCommerce Store",
    platform: "WooCommerce",
    icon: siWoo,
    status: "Disconnected",
    lastSync: "2 days ago",
    products: 0,
    orders: 0,
  },
  {
    id: 4,
    name: "Facebook Shop",
    platform: "Facebook",
    icon: siFacebook,
    status: "Connected",
    lastSync: "15 mins ago",
    products: 456,
    orders: 89,
  },
  {
    id: 5,
    name: "Instagram Shopping",
    platform: "Instagram",
    icon: siInstagram,
    status: "Pending",
    lastSync: "1 hour ago",
    products: 234,
    orders: 67,
  },
  {
    id: 6,
    name: "eBay Store",
    platform: "eBay",
    icon: siEbay,
    status: "Connected",
    lastSync: "30 mins ago",
    products: 178,
    orders: 45,
  },
];

function StoreStatusBadge({ status }: { status: string }) {
  const config = {
    Connected: { icon: CheckCircle, className: "bg-green-500/10 border-green-600/50 text-green-700 dark:text-green-300" },
    Pending: { icon: Zap, className: "bg-yellow-500/10 border-yellow-600/50 text-yellow-700 dark:text-yellow-300" },
    Disconnected: { icon: XCircle, className: "bg-destructive/10 border-destructive/50 text-destructive" },
  };
  
  const { icon: Icon, className } = config[status as keyof typeof config] || config.Disconnected;
  
  return (
    <Badge variant="secondary" className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium text-[10px] ${className}`}>
      <Icon className="size-3" />
      {status}
    </Badge>
  );
}

export function ConnectedStores() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Plug className="size-4 text-muted-foreground" />
          Connected Stores & Channels
        </CardTitle>
        <CardAction className="flex items-center gap-1">
          <Button size="sm" className="h-7 gap-1 text-xs">
            <Link2 className="size-3" />
            Connect Store
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs">
            <ArrowRight className="size-3" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y divide-border">
          {stores.map((store) => {
            const Icon = store.icon;
            
            return (
              <div key={store.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-9 rounded-md border bg-background flex items-center justify-center shrink-0">
                      <SimpleIcon icon={Icon} className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{store.name}</span>
                        <StoreStatusBadge status={store.status} />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{store.products} products</span>
                        <span>•</span>
                        <span>{store.orders} orders</span>
                        <span>•</span>
                        <span>Synced {store.lastSync}</span>
                      </div>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 shrink-0">
                    Manage
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}