import { AlertTriangle } from "lucide-react";
import type { OrderDetail } from "@pakcommerce/shared";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function OrderCustomerPanel({
  customer,
  isDraft,
}: {
  customer: OrderDetail["customer"];
  isDraft: boolean;
}) {
  const address = customer.addressLine?.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-3">
          <Row label="Name">
            <span className="font-medium">{customer.name}</span>
          </Row>
          <Row label="Phone">{customer.phone}</Row>
          <Row label="City">{customer.city}</Row>
          <Row label="Email">{customer.email || <span className="text-muted-foreground">—</span>}</Row>
          <Row label="Address">
            {address ? (
              address
            ) : isDraft ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
                <AlertTriangle className="size-4" />
                Address required to confirm
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Row>
        </dl>
      </CardContent>
    </Card>
  );
}
