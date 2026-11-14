"use client";
"use no memo";

import type { ColumnDef } from "@tanstack/react-table";
import type { CustomerListItem } from "@pakcommerce/shared";
import { format, parseISO } from "date-fns";

import { formatPkr } from "@/lib/currency";

import { CustomerTagList } from "./customer-tag-badge";

export const customersColumns: ColumnDef<CustomerListItem>[] = [
  {
    id: "name",
    header: "Customer",
    cell: ({ row }) => <span className="font-medium text-sm">{row.original.name}</span>,
  },
  {
    id: "phone",
    header: "Phone",
    cell: ({ row }) => <span className="text-sm">{row.original.phone}</span>,
  },
  {
    id: "city",
    header: "City",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.city}</span>,
  },
  {
    id: "tags",
    header: "Tags",
    cell: ({ row }) => <CustomerTagList tags={row.original.tags} />,
  },
  {
    id: "orders",
    header: "Orders",
    cell: ({ row }) => (
      <span title="Completed / total orders">
        {row.original.summary.completedOrderCount}/{row.original.summary.totalOrderCount}
      </span>
    ),
  },
  {
    id: "spend",
    header: "Lifetime spend",
    cell: ({ row }) => (
      <span className="font-semibold">{formatPkr(row.original.summary.lifetimeSpend.amountMinor)}</span>
    ),
  },
  {
    id: "lastOrder",
    header: "Last order",
    cell: ({ row }) =>
      row.original.summary.lastOrderAt ? (
        <div className="text-sm">{format(parseISO(row.original.summary.lastOrderAt), "MMM d, yyyy")}</div>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];
