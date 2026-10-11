"use client";

import Link from "next/link";
import { Archive, Edit3, Eye, Layers, Package } from "lucide-react";
import type { ProductListItem } from "@pakcommerce/shared";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPkr } from "@/lib/currency";

interface ProductTableProps {
  products: ProductListItem[];
  onEdit: (product: ProductListItem) => void;
  onArchive: (product: ProductListItem) => void;
}

function renderSolidStatusBadge(status: string) {
  switch (status) {
    case "active":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-2xs">
          <span className="size-1.5 rounded-full bg-white animate-pulse" />
          Live
        </span>
      );
    case "draft":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 dark:bg-zinc-700 px-2.5 py-0.5 text-[11px] font-bold text-zinc-100 shadow-2xs">
          <span className="size-1.5 rounded-full bg-zinc-400" />
          Draft
        </span>
      );
    case "archived":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-2xs">
          <span className="size-1.5 rounded-full bg-white" />
          Archived
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-700 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-2xs">
          {status}
        </span>
      );
  }
}

function renderSolidInventoryBadge(state: string) {
  switch (state) {
    case "in_stock":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
          <span className="size-1.5 rounded-full bg-emerald-600" />
          In Stock
        </span>
      );
    case "low_stock":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">
          <span className="size-1.5 rounded-full bg-amber-500" />
          Low Stock
        </span>
      );
    case "out_of_stock":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-2xs">
          <span className="size-1.5 rounded-full bg-white" />
          Out of Stock
        </span>
      );
    case "untracked":
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          Untracked
        </span>
      );
  }
}

export function ProductTable({ products, onEdit, onArchive }: ProductTableProps) {
  return (
    <div className="rounded-xl border bg-card/60 backdrop-blur-xs shadow-2xs overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/40 text-xs">
          <TableRow>
            <TableHead className="w-[340px] font-semibold text-foreground">Product</TableHead>
            <TableHead className="font-semibold text-foreground">Status</TableHead>
            <TableHead className="font-semibold text-foreground">Price</TableHead>
            <TableHead className="font-semibold text-foreground">Variants</TableHead>
            <TableHead className="font-semibold text-foreground">Inventory</TableHead>
            <TableHead className="hidden lg:table-cell font-semibold text-foreground">Channels</TableHead>
            <TableHead className="text-right font-semibold text-foreground">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => {
            const isSinglePrice = product.priceRange.min.amountMinor === product.priceRange.max.amountMinor;
            const priceLabel = isSinglePrice
              ? formatPkr(product.priceRange.min.amountMinor)
              : `${formatPkr(product.priceRange.min.amountMinor)} – ${formatPkr(product.priceRange.max.amountMinor)}`;

            return (
              <TableRow
                key={product.id}
                className="group hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={(e) => {
                  // If not clicking an action button, navigate to details
                  if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("a")) return;
                  onEdit(product);
                }}
              >
                {/* Product Column (Polaris Index Row) */}
                <TableCell>
                  <div className="flex items-center gap-3">
                    {product.primaryImage?.url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={product.primaryImage.url}
                        alt={product.title}
                        className="size-11 shrink-0 rounded-xl object-cover border border-border transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/15 transition-transform group-hover:scale-105">
                        <Package className="size-5" />
                      </div>
                    )}
                    <div className="flex flex-col min-w-0">
                      <Link
                        href={`/dashboard/products/${product.id}`}
                        className="font-semibold text-foreground hover:text-primary transition-colors truncate max-w-[260px] text-sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {product.title}
                      </Link>
                      
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-[11px] text-muted-foreground truncate">
                          {product.slug}
                        </span>
                        {product.tags && product.tags.length > 0 ? (
                          <span className="text-[10px] bg-muted/80 text-muted-foreground px-1.5 py-0.2 rounded font-medium">
                            #{product.tags[0]}
                            {product.tags.length > 1 ? ` +${product.tags.length - 1}` : ""}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </TableCell>

                {/* Status Column */}
                <TableCell>
                  {renderSolidStatusBadge(product.status)}
                </TableCell>

                {/* Price Column */}
                <TableCell>
                  <span className="font-semibold text-foreground text-sm">{priceLabel}</span>
                </TableCell>

                {/* Variants Column */}
                <TableCell>
                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
                    <Layers className="size-3.5 text-primary" />
                    <span>
                      {product.variantCount} {product.variantCount === 1 ? "variant" : "variants"}
                    </span>
                  </div>
                </TableCell>

                {/* Stock Status Column */}
                <TableCell>
                  {renderSolidInventoryBadge(product.inventoryState)}
                </TableCell>

                {/* Channels / Sync Readiness Column */}
                <TableCell className="hidden lg:table-cell">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    <span>Shopify, Woo</span>
                  </div>
                </TableCell>

                {/* Actions Column */}
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                      title="View Full Detail Page"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link href={`/dashboard/products/${product.id}`}>
                        <Eye className="size-4" />
                      </Link>
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(product);
                      }}
                      title="Quick Edit in Studio"
                    >
                      <Edit3 className="size-4" />
                    </Button>

                    {product.status !== "archived" ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          onArchive(product);
                        }}
                        title="Archive Product"
                      >
                        <Archive className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
