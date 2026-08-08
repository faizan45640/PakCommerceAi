// orders-table/columns.tsx
"use client";
"use no memo";

import type { ColumnDef } from "@tanstack/react-table";
import { format, parseISO } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

import type { OrderRow } from "./schema";

function OrderStatusBadge({ status }: { status: string }) {
  const config = {
    "Delivered": { className: "bg-green-500/10 border-green-600/50 text-green-700 dark:text-green-300" },
    "Shipped": { className: "bg-purple-500/10 border-purple-600/50 text-purple-700 dark:text-purple-300" },
    "Confirmed": { className: "bg-blue-500/10 border-blue-600/50 text-blue-700 dark:text-blue-300" },
    "Pending": { className: "bg-yellow-500/10 border-yellow-600/50 text-yellow-700 dark:text-yellow-300" },
    "Cancelled": { className: "bg-destructive/10 border-destructive/50 text-destructive" },
    "Returned": { className: "bg-orange-500/10 border-orange-600/50 text-orange-700 dark:text-orange-300" },
  };
  
  const { className } = config[status as keyof typeof config] || config.Pending;
  
  return (
    <Badge variant="secondary" className={`rounded-md px-2.5 py-1 font-medium text-[10px] ${className}`}>
      {status}
    </Badge>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  const config = {
    "Shopify": "bg-green-500/10 text-green-700 dark:text-green-300",
    "WhatsApp": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    "Daraz": "bg-blue-500/10 text-blue-700 dark:text-blue-300",
    "Instagram": "bg-pink-500/10 text-pink-700 dark:text-pink-300",
    "Facebook": "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  };
  
  const className = config[channel as keyof typeof config] || "bg-gray-500/10 text-gray-700";
  
  return (
    <Badge variant="secondary" className={`rounded-md px-2.5 py-1 font-medium text-[10px] ${className}`}>
      {channel}
    </Badge>
  );
}

export const ordersColumns: ColumnDef<OrderRow>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all orders"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={`Select ${row.original.id}`}
        />
      </div>
    ),
    enableHiding: false,
  },
  {
    accessorKey: "id",
    header: "Order ID",
    cell: ({ row }) => (
      <div className="font-medium text-sm">{row.original.id}</div>
    ),
    enableHiding: false,
  },
  {
    accessorKey: "customer",
    header: "Customer",
    cell: ({ row }) => (
      <div>
        <div className="font-medium text-sm">{row.original.customer}</div>
        <div className="text-muted-foreground text-xs">{row.original.email}</div>
      </div>
    ),
  },
  {
    accessorKey: "channel",
    header: "Channel",
    cell: ({ row }) => <ChannelBadge channel={row.original.channel} />,
  },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => (
      <span className="font-semibold">${row.original.amount.toFixed(2)}</span>
    ),
  },
  {
    accessorKey: "items",
    header: "Items",
    cell: ({ row }) => <span>{row.original.items}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <OrderStatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "city",
    header: "City",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.city}</span>,
  },
  {
    accessorKey: "date",
    header: "Date",
    cell: ({ row }) => (
      <div className="text-sm">
        {format(parseISO(row.original.date), "MMM d, yyyy")}
      </div>
    ),
  },
];