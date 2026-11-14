"use client";
"use no memo";

import * as React from "react";

import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { CustomerSort, CustomerTag } from "@pakcommerce/shared";
import { customerTagValues } from "@pakcommerce/shared/customers";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchCustomers, type CustomerListResult } from "@/lib/api/customers";
import { fetchCurrentWorkspace } from "@/lib/api/products";

import { CustomerTagBadge } from "./customer-tag-badge";
import { CUSTOMER_TAG_DESCRIPTIONS, CUSTOMER_TAG_LABELS } from "./customer-tags";
import { customersColumns } from "./customers-columns";

const PAGE_SIZE = 10;

const sortOptions: { value: CustomerSort; label: string }[] = [
  { value: "last_order_desc", label: "Last order" },
  { value: "spend_desc", label: "Lifetime spend: High to Low" },
  { value: "name_asc", label: "Name: A to Z" },
  { value: "created_desc", label: "Newest customers" },
];

export function CustomersTable({ initialSearch = "" }: { initialSearch?: string }) {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<CustomerListResult | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const [search, setSearch] = React.useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = React.useState(initialSearch);
  const [tags, setTags] = React.useState<CustomerTag[]>([]);
  const [sort, setSort] = React.useState<CustomerSort>("last_order_desc");
  // The API cursor is opaque, so paging keeps the cursors it handed out.
  const [cursors, setCursors] = React.useState<(string | undefined)[]>([undefined]);
  const page = cursors.length;
  const cursor = cursors[cursors.length - 1];
  const [reloadKey, setReloadKey] = React.useState(0);

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

        const data = await fetchCustomers({
          workspaceId: id,
          query: debouncedSearch,
          tags,
          sort,
          limit: PAGE_SIZE,
          cursor,
        });
        if (!ignore) setResult(data);
      } catch (err: unknown) {
        if (!ignore) setErrorMessage(err instanceof Error ? err.message : "Failed to load customers.");
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [workspaceId, debouncedSearch, tags, sort, cursor, reloadKey]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: result?.items ?? [],
    columns: customersColumns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
  });

  const total = result?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(debouncedSearch) || tags.length > 0;

  function toggleTag(tag: CustomerTag, checked: boolean) {
    setTags((current) => (checked ? [...current, tag] : current.filter((value) => value !== tag)));
    setCursors([undefined]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full lg:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-7 rounded-[min(var(--radius-md),12px)] pl-8"
              placeholder="Search by name, phone, city or email..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Tags{tags.length ? `: ${tags.length}` : ""}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64" align="start">
              {customerTagValues.map((tag) => (
                <DropdownMenuCheckboxItem
                  key={tag}
                  checked={tags.includes(tag)}
                  onCheckedChange={(checked) => toggleTag(tag, checked === true)}
                  onSelect={(event) => event.preventDefault()}
                >
                  <div className="flex flex-col">
                    <span>{CUSTOMER_TAG_LABELS[tag]}</span>
                    <span className="text-muted-foreground text-xs">{CUSTOMER_TAG_DESCRIPTIONS[tag]}</span>
                  </div>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {tags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((tag) => (
                <CustomerTagBadge key={tag} tag={tag} />
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTags([]);
                  setCursors([undefined]);
                }}
              >
                Clear
              </Button>
            </div>
          ) : null}
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
                setSort(value as CustomerSort);
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
                <TableCell colSpan={customersColumns.length} className="h-24 text-center">
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
                  <TableCell colSpan={customersColumns.length} className="p-3">
                    <div className="h-6 animate-pulse rounded bg-muted" />
                  </TableCell>
                </TableRow>
              ))
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={`cursor-pointer ${isLoading ? "opacity-60" : ""}`}
                  onClick={() => router.push(`/dashboard/customers/${row.original.id}`)}
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
                <TableCell colSpan={customersColumns.length} className="h-24 text-center text-muted-foreground">
                  {hasFilters
                    ? "No customers match these filters."
                    : "No customers yet. They appear automatically when orders are created."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between px-1">
        <div className="text-muted-foreground text-sm">
          {total} customer{total === 1 ? "" : "s"}
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
