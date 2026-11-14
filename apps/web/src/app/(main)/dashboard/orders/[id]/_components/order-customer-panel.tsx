"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { CustomerTag, OrderDetail } from "@pakcommerce/shared";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchCustomerById } from "@/lib/api/customers";

import { CustomerLink } from "../../../customers/_components/customer-link";
import { CustomerTagList } from "../../../customers/_components/customer-tag-badge";

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
  customerId,
  workspaceId,
  orderVersion,
  isDraft,
}: {
  customer: OrderDetail["customer"];
  customerId: string;
  workspaceId: string;
  /** Changes when the order does (e.g. `updatedAt`), so the tags are re-read after confirm/cancel. */
  orderVersion: string;
  isDraft: boolean;
}) {
  // Tags are a nicety (first-time buyers matter for COD risk); the panel works without them.
  const [tags, setTags] = useState<CustomerTag[] | null>(null);

  useEffect(() => {
    let ignore = false;
    fetchCustomerById(workspaceId, customerId)
      .then((detail) => {
        if (!ignore) setTags(detail.tags);
      })
      .catch(() => {
        if (!ignore) setTags(null);
      });
    return () => {
      ignore = true;
    };
  }, [workspaceId, customerId, orderVersion]);

  const address = customer.addressLine?.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-3">
          <Row label="Name">
            <CustomerLink customerId={customerId} className="font-medium">
              {customer.name}
            </CustomerLink>
          </Row>
          {tags ? (
            <Row label="Customer tags">
              <CustomerTagList tags={tags} />
            </Row>
          ) : null}
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
