// orders-table/columns.tsx
"use client";
"use no memo";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { format, parseISO } from "date-fns";

import { formatPkr } from "@/lib/currency";

import { OrderConversationLink, OrderCreatedViaBadge } from "../order-ai-badge";
import { OrderChannelBadge, OrderStatusBadge, shortOrderId } from "../order-badges";
import type { OrderRow } from "./schema";

export const ordersColumns: ColumnDef<OrderRow>[] = [
  {
    accessorKey: "id",
    header: "Order ID",
    cell: ({ row }) => (
      <div>
        <Link href={`/dashboard/orders/${row.original.id}`} className="font-medium text-sm hover:underline">
          {shortOrderId(row.original.id)}
        </Link>
        {row.original.createdVia && row.original.createdVia !== "manual" ? (
          <div className="mt-1 flex flex-col items-start gap-0.5">
            <OrderCreatedViaBadge createdVia={row.original.createdVia} />
            <OrderConversationLink conversationId={row.original.conversationId} />
          </div>
        ) : null}
      </div>
    ),
  },
  {
    id: "customer",
    header: "Customer",
    cell: ({ row }) => (
      <div>
        <div className="font-medium text-sm">{row.original.customerName}</div>
        <div className="text-muted-foreground text-xs">{row.original.customerPhone}</div>
      </div>
    ),
  },
  {
    accessorKey: "channel",
    header: "Channel",
    cell: ({ row }) => <OrderChannelBadge channel={row.original.channel} />,
  },
  {
    id: "amount",
    header: "Amount",
    cell: ({ row }) => <span className="font-semibold">{formatPkr(row.original.total.amountMinor)}</span>,
  },
  {
    accessorKey: "itemCount",
    header: "Items",
    cell: ({ row }) => <span>{row.original.itemCount}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <OrderStatusBadge status={row.original.status} />,
  },
  {
    id: "city",
    header: "City",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.customerCity}</span>,
  },
  {
    id: "date",
    header: "Date",
    cell: ({ row }) => (
      <div className="text-sm">{format(parseISO(row.original.createdAt), "MMM d, yyyy")}</div>
    ),
  },
];
