"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Mail, MapPin, Phone } from "lucide-react";
import type { CustomerDetail } from "@pakcommerce/shared";

import { Button } from "@/components/ui/button";
import { ApiRequestError } from "@/lib/api/api-client";
import { fetchCustomerById } from "@/lib/api/customers";
import { fetchCurrentWorkspace } from "@/lib/api/products";
import { createClient } from "@/lib/supabase/client";

import { CustomerTagList } from "../../_components/customer-tag-badge";
import { CustomerNotes } from "./customer-notes-section";
import { CustomerOrderHistory } from "./customer-order-history";
import { CustomerOverviewCards } from "./customer-overview-cards";
import { CustomerTimeline } from "./customer-timeline-card";

export function CustomerProfileView({ id }: { id: string }) {
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setIsLoading(true);
      setErrorMessage(null);
      setNotFound(false);
      try {
        const workspace = await fetchCurrentWorkspace();
        const data = await fetchCustomerById(workspace.id, id);
        const { data: session } = await createClient().auth.getSession();
        if (!ignore) {
          setWorkspaceId(workspace.id);
          setUserId(session.session?.user.id ?? null);
          setCustomer(data);
        }
      } catch (err: unknown) {
        if (ignore) return;
        if (err instanceof ApiRequestError && err.status === 404) setNotFound(true);
        else setErrorMessage(err instanceof Error ? err.message : "Failed to load customer.");
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [id, reloadKey]);

  // Re-reads the profile after a note changes so summary, tags and timeline stay true.
  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setCustomer(await fetchCustomerById(workspaceId, id));
  }, [workspaceId, id]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse" aria-busy="true">
        <div className="h-6 w-36 rounded-md bg-muted" />
        <div className="h-10 w-72 rounded-md bg-muted" />
        <div className="h-64 rounded-xl border bg-muted/20" />
      </div>
    );
  }

  if (errorMessage || !customer || !workspaceId) {
    return (
      <div className="flex flex-col gap-6">
        <Link
          href="/dashboard/customers"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Customers
        </Link>
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-12 text-center">
          <AlertCircle className="size-10 text-destructive" />
          <h2 className="font-semibold text-lg">{notFound ? "Customer Not Found" : "Could not load customer"}</h2>
          <p className="max-w-md text-muted-foreground text-sm">
            {notFound
              ? "The requested customer does not exist in this workspace."
              : (errorMessage ?? "Something went wrong.")}
          </p>
          <div className="mt-2 flex gap-2">
            {notFound ? null : (
              <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
                Retry
              </Button>
            )}
            <Button asChild>
              <Link href="/dashboard/customers">Return to Customers</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const address = customer.addressLine?.trim();
  // Legacy orders without a usable phone are keyed `order:<id>`; that is not dialable.
  const dialable = customer.phone.startsWith("+") || /^\d+$/.test(customer.phone);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/dashboard/customers"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Customers
      </Link>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-semibold text-2xl tracking-tight">{customer.name}</h1>
          <CustomerTagList tags={customer.tags} />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-muted-foreground text-sm">
          <span className="inline-flex items-center gap-1.5">
            <Phone className="size-4" />
            {dialable ? (
              <a href={`tel:${customer.phone}`} className="hover:text-foreground hover:underline">
                {customer.phone}
              </a>
            ) : (
              customer.phone
            )}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4" />
            {[customer.city, address].filter(Boolean).join(", ")}
          </span>
          {customer.email ? (
            <span className="inline-flex items-center gap-1.5">
              <Mail className="size-4" />
              <a href={`mailto:${customer.email}`} className="hover:text-foreground hover:underline">
                {customer.email}
              </a>
            </span>
          ) : null}
        </div>
      </div>

      <CustomerOverviewCards summary={customer.summary} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <CustomerOrderHistory customer={customer} />
          <CustomerNotes
            customer={customer}
            workspaceId={workspaceId}
            userId={userId}
            onChanged={refresh}
          />
        </div>
        <div className="flex flex-col gap-6">
          <CustomerTimeline events={customer.timeline} />
        </div>
      </div>
    </div>
  );
}
