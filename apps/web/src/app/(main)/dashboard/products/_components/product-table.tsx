"use client";

import Link from "next/link";
import { Archive, Edit, Eye, Layers, Package } from "lucide-react";
import type { ProductListItem } from "@pakcommerce/shared";

import { StatusBadge, type StatusTone } from "@/components/dashboard/status-badge";
import { Badge } from "@/components/ui/badge";
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

function getInventoryBadgeProps(state: string): { label: string; tone: StatusTone } {
  switch (state) {
    case "in_stock":
      return { label: "In Stock", tone: "success" };
    case "low_stock":
      return { label: "Low Stock", tone: "warning" };
    case "out_of_stock":
      return { label: "Out of Stock", tone: "danger" };
    case "untracked":
    default:
      return { label: "Untracked", tone: "neutral" };
  }
}

function getStatusBadgeProps(status: string): { label: string; tone: StatusTone } {
  switch (status) {
    case "active":
      return { label: "Live", tone: "success" };
    case "draft":
      return { label: "Draft", tone: "neutral" };
    case "archived":
      return { label: "Archived", tone: "danger" };
    default:
      return { label: status, tone: "neutral" };
  }
}

export function ProductTable({ products, onEdit, onArchive }: ProductTableProps) {
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[320px]">Product</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Variants</TableHead>
            <TableHead>Stock Status</TableHead>
            <TableHead className="hidden lg:table-cell">Sync Channels</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => {
            const statusBadge = getStatusBadgeProps(product.status);
            const invBadge = getInventoryBadgeProps(product.inventoryState);
            const isSinglePrice = product.priceRange.min.amountMinor === product.priceRange.max.amountMinor;
            const priceLabel = isSinglePrice
              ? formatPkr(product.priceRange.min.amountMinor)
              : `${formatPkr(product.priceRange.min.amountMinor)} – ${formatPkr(product.priceRange.max.amountMinor)}`;

            return (
              <TableRow key={product.id}>
                {/* Product Column */}
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Package className="size-5" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <Link
                        href={`/dashboard/products/${product.id}`}
                        className="font-medium text-foreground hover:underline truncate max-w-[240px]"
                      >
                        {product.title}
                      </Link>
                      {product.tags && product.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {product.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="text-[11px] bg-muted/60 text-muted-foreground px-1.5 py-0.2 rounded"
                            >
                              #{tag}
                            </span>
                          ))}
                          {product.tags.length > 3 ? (
                            <span className="text-[11px] text-muted-foreground">
                              +{product.tags.length - 3}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">{product.slug}</span>
                      )}
                    </div>
                  </div>
                </TableCell>

                {/* Status Column */}
                <TableCell>
                  <StatusBadge label={statusBadge.label} tone={statusBadge.tone} />
                </TableCell>

                {/* Price Column */}
                <TableCell>
                  <span className="font-semibold text-foreground">{priceLabel}</span>
                </TableCell>

                {/* Variants Column */}
                <TableCell>
                  <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                    <Layers className="size-3.5" />
                    <span>
                      {product.variantCount} {product.variantCount === 1 ? "variant" : "variants"}
                    </span>
                  </div>
                </TableCell>

                {/* Stock Status Column */}
                <TableCell>
                  <StatusBadge label={invBadge.label} tone={invBadge.tone} />
                </TableCell>

                {/* Channels / Sync Readiness Column */}
                <TableCell className="hidden lg:table-cell">
                  <Badge variant="outline" className="border-dashed text-xs text-muted-foreground font-normal">
                    Ready to Sync
                  </Badge>
                </TableCell>

                {/* Actions Column */}
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-foreground"
                      title="View Details"
                    >
                      <Link href={`/dashboard/products/${product.id}`}>
                        <Eye className="size-4" />
                      </Link>
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-foreground"
                      onClick={() => onEdit(product)}
                      title="Edit Product"
                    >
                      <Edit className="size-4" />
                    </Button>

                    {product.status !== "archived" ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        onClick={() => onArchive(product)}
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
