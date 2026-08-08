// courier-performance.tsx
"use client";

import { ArrowRight, Gauge, PackageCheck, Timer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const courierPerformance = [
  {
    courier: "BlueDart",
    deliverySpeed: 2.1,
    rtoRate: 5.2,
    codSettlement: 3.0,
    totalOrders: 486,
    rating: 4.8,
  },
  {
    courier: "DTDC",
    deliverySpeed: 3.5,
    rtoRate: 7.8,
    codSettlement: 5.0,
    totalOrders: 392,
    rating: 4.2,
  },
  {
    courier: "Delhivery",
    deliverySpeed: 2.8,
    rtoRate: 9.3,
    codSettlement: 4.5,
    totalOrders: 428,
    rating: 4.1,
  },
  {
    courier: "Shadowfax",
    deliverySpeed: 4.2,
    rtoRate: 12.1,
    codSettlement: 6.0,
    totalOrders: 285,
    rating: 3.8,
  },
  {
    courier: "XpressBees",
    deliverySpeed: 3.0,
    rtoRate: 6.7,
    codSettlement: 4.0,
    totalOrders: 256,
    rating: 4.3,
  },
];

function RatingStars({ rating }: { rating: number }) {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  const totalStars = 5;
  
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: fullStars }).map((_, i) => (
        <span key={i} className="text-yellow-500">★</span>
      ))}
      {hasHalfStar && <span className="text-yellow-500">☆</span>}
      {Array.from({ length: totalStars - fullStars - (hasHalfStar ? 1 : 0) }).map((_, i) => (
        <span key={i} className="text-muted-foreground">★</span>
      ))}
      <span className="ml-1 text-muted-foreground text-xs">{rating.toFixed(1)}</span>
    </div>
  );
}

export function CourierPerformance() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Gauge className="size-4 text-muted-foreground" />
          Courier Performance Comparison
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          View Full Report <ArrowRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y divide-border">
          {courierPerformance.map((courier) => (
            <div key={courier.courier} className="py-4 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{courier.courier}</span>
                    <RatingStars rating={courier.rating} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {courier.totalOrders} orders delivered
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  #{courierPerformance.indexOf(courier) + 1} ranked
                </Badge>
              </div>
              
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div className="rounded-md bg-muted/30 p-2 text-center">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground text-[10px]">
                    <Timer className="size-3" />
                    Delivery Speed
                  </div>
                  <div className="font-semibold text-sm">{courier.deliverySpeed} days</div>
                </div>
                <div className="rounded-md bg-muted/30 p-2 text-center">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground text-[10px]">
                    <PackageCheck className="size-3" />
                    RTO Rate
                  </div>
                  <div className={`font-semibold text-sm ${courier.rtoRate > 8 ? "text-destructive" : "text-green-600"}`}>
                    {courier.rtoRate}%
                  </div>
                </div>
                <div className="rounded-md bg-muted/30 p-2 text-center">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground text-[10px]">
                    <Gauge className="size-3" />
                    COD Settlement
                  </div>
                  <div className="font-semibold text-sm">{courier.codSettlement} days</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}