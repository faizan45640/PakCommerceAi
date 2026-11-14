// orders-table/table.tsx
"use client";
"use no memo";

import * as React from "react";

import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { ArrowUpDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { orderChannelValues, orderStatusValues } from "@pakcommerce/shared/orders";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchCustomerById } from "@/lib/api/customers";
import { fetchOrders, type OrderListResult } from "@/lib/api/orders";
import { fetchCurrentWorkspace } from "@/lib/api/products";

import { ORDER_CHANNEL_LABELS, ORDER_STATUS_LABELS } from "../order-badges";
import { ordersColumns } from "./columns";

const PAGE_SIZE = 10;

const sortOptions = [
  { value: "newest", label: "Newest first" },
  { value: "total_desc", label: "Amount: High to Low" },
  { value: "total_asc", label: "Amount: Low to High" },
  { value: "updated_desc", label: "Recently updated" },
] as const;

export function OrdersTable({ customerId }: { customerId?: string }) {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<OrderListResult | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [channel, setChannel] = React.useState("all");
  const [sort, setSort] = React.useState<string>("newest");
  // The API cursor is opaque, so paging keeps the cursors it handed out.
  const [cursors, setCursors] = React.useState<(string | undefined)[]>([undefined]);
  const page = cursors.length;
  const cursor = cursors[cursors.length - 1];
  const [reloadKey, setReloadKey] = React.useState(0);
  const [customerName, setCustomerName] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!customerId || !workspaceId) return;
    let ignore = false;
    fetchCustomerById(workspaceId, customerId)
      .then((customer) => {
        if (!ignore) setCustomerName(customer.name);
      })
      .catch(() => {
        if (!ignore) setCustomerName(null);
      });
    return () => {
      ignore = true;
    };
  }, [customerId, workspaceId]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCursors([undefined]);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    let ignore = false;

    async function load() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const id = workspaceId ?? (await fetchCurrentWorkspace()).id;
        if (ignore) return;
        if (!workspaceId) setWorkspaceId(id);

        const data = await fetchOrders({
          workspaceId: id,
          query: debouncedSearch,
          customerId,
          statuses: status === "all" ? undefined : [status],
          channels: channel === "all" ? undefined : [channel],
          sort,
          limit: PAGE_SIZE,
          cursor,
        });
        if (!ignore) setResult(data);
      } catch (err: unknown) {
        if (!ignore) setErrorMessage(err instanceof Error ? err.message : "Failed to load orders.");
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [workspaceId, customerId, debouncedSearch, status, channel, sort, cursor, reloadKey]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: result?.items ?? [],
    columns: ordersColumns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
  });

  const total = result?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(debouncedSearch) || Boolean(customerId) || status !== "all" || channel !== "all";

  return (
    <div className="space-y-4">
      {customerId ? (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 rounded-md px-2.5 py-1 text-xs">
            Filtered to {customerName ?? "customer"}
            <button
              type="button"
              className="rounded-sm hover:text-foreground"
              onClick={() => router.push("/dashboard/orders")}
            >
              <span className="sr-only">Clear customer filter</span>
              <X className="size-3" />
            </button>
          </Badge>
        </div>
      ) : null}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full lg:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-7 rounded-[min(var(--radius-md),12px)] pl-8"
              placeholder="Search by customer, phone or city..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <FilterMenu
            label="Status"
            value={status}
            options={orderStatusValues.map((value) => ({ value, label: ORDER_STATUS_LABELS[value] }))}
            onChange={(value) => {
              setStatus(value);
              setCursors([undefined]);
            }}
          />
          <FilterMenu
            label="Channel"
            value={channel}
            options={orderChannelValues.map((value) => ({ value, label: ORDER_CHANNEL_LABELS[value] }))}
            onChange={(value) => {
              setChannel(value);
              setCursors([undefined]);
            }}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <ArrowUpDown />
              Sort
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={sort}
              onValueChange={(value) => {
                setSort(value);
                setCursors([undefined]);
              }}
            >
              {sortOptions.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader className="bg-muted/15">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan} className="h-11 p-3 font-medium">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {errorMessage ? (
              <TableRow>
                <TableCell colSpan={ordersColumns.length} className="h-24 text-center">
                  <p role="alert" className="text-destructive text-sm">
                    {errorMessage}
                  </p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => setReloadKey((key) => key + 1)}>
                    Retry
                  </Button>
                </TableCell>
              </TableRow>
            ) : isLoading && !result ? (
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index} aria-busy="true">
                  <TableCell colSpan={ordersColumns.length} className="p-3">
                    <div className="h-6 animate-pulse rounded bg-muted" />
                  </TableCell>
                </TableRow>
              ))
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={`cursor-pointer ${isLoading ? "opacity-60" : ""}`}
                  onClick={() => router.push(`/dashboard/orders/${row.original.id}`)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="p-3 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={ordersColumns.length} className="h-24 text-center text-muted-foreground">
                  {hasFilters ? "No orders match these filters." : "No orders yet."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between px-1">
        <div className="text-muted-foreground text-sm">
          {total} order{total === 1 ? "" : "s"}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-medium text-sm">
            Page {page} of {pageCount}
          </span>
          <Button
            variant="outline"
            className="size-8"
            size="icon"
            onClick={() => setCursors((current) => current.slice(0, -1))}
            disabled={page <= 1 || isLoading}
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            className="size-8"
            size="icon"
            onClick={() => setCursors((current) => [...current, result?.nextCursor ?? undefined])}
            disabled={!result?.nextCursor || isLoading}
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function FilterMenu({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const current = options.find((option) => option.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {label}
          {current ? `: ${current.label}` : ""}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-40" align="start">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
