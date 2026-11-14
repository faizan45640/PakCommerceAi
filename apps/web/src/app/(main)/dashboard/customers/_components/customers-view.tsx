"use client";

import * as React from "react";

import { useRouter } from "next/navigation";

import { fetchCustomerByPhone } from "@/lib/api/customers";
import { fetchCurrentWorkspace } from "@/lib/api/products";

import { CustomersTable } from "./customers-table";

/**
 * The list, plus the `?phone=` hook for deep links (e.g. the conversation
 * inbox): a phone that matches a customer goes straight to the profile,
 * otherwise the list opens with the phone as the search term.
 */
export function CustomersView({ phone }: { phone?: string }) {
  const router = useRouter();
  const [resolving, setResolving] = React.useState(Boolean(phone));

  React.useEffect(() => {
    if (!phone) return;
    let ignore = false;

    async function resolve(value: string) {
      try {
        const workspace = await fetchCurrentWorkspace();
        const customer = await fetchCustomerByPhone(workspace.id, value);
        if (ignore) return;
        if (customer) {
          router.replace(`/dashboard/customers/${customer.id}`);
          return;
        }
      } catch {
        // Fall through to the list, which shows its own error state.
      }
      if (!ignore) setResolving(false);
    }

    void resolve(phone);
    return () => {
      ignore = true;
    };
  }, [phone, router]);

  if (resolving) {
    return (
      <div className="flex flex-col gap-3 animate-pulse" aria-busy="true">
        <div className="h-7 w-80 rounded-md bg-muted" />
        <div className="h-64 rounded-lg border bg-muted/20" />
      </div>
    );
  }

  return <CustomersTable initialSearch={phone ?? ""} />;
}
