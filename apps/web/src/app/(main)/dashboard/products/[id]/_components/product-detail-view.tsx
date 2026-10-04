"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Edit,
  Layers,
  Package,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import type { Product, ProductListItem } from "@pakcommerce/shared";

import { MetricCard } from "@/components/dashboard/metric-card";
import { StatusBadge, type StatusTone } from "@/components/dashboard/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchProductById } from "@/lib/api/products";
import { formatPkr } from "@/lib/currency";

import { ProductArchiveDialog } from "../../_components/product-archive-dialog";
import { ProductFormDialog } from "../../_components/product-form-dialog";

interface ProductDetailViewProps {
  id: string;
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
      return { label: "Live (Active)", tone: "success" };
    case "draft":
      return { label: "Draft", tone: "neutral" };
    case "archived":
      return { label: "Archived", tone: "danger" };
    default:
      return { label: status, tone: "neutral" };
  }
}

export function ProductDetailView({ id }: ProductDetailViewProps) {
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Dialog States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const data = await fetchProductById(id);
        if (!ignore) {
          setProduct(data);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!ignore) {
          const msg = err instanceof Error ? err.message : "Failed to load product details.";
          setErrorMessage(msg);
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      ignore = true;
    };
  }, [id]);

  const reloadProduct = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await fetchProductById(id);
      setProduct(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load product details.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse" aria-busy="true">
        <div className="h-6 w-36 rounded-md bg-muted" />
        <div className="h-10 w-72 rounded-md bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl border bg-muted/40" />
          ))}
        </div>
        <div className="h-64 rounded-xl border bg-muted/20" />
      </div>
    );
  }

  if (errorMessage || !product) {
    return (
      <div className="flex flex-col gap-6">
        <Link
          href="/dashboard/products"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Products
        </Link>

        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-12 text-center">
          <AlertCircle className="size-10 text-destructive" />
          <h2 className="font-semibold text-lg">Product Not Found</h2>
          <p className="max-w-md text-muted-foreground text-sm">
            {errorMessage ?? "The requested product does not exist or has been removed from this workspace."}
          </p>
          <Button onClick={() => router.push("/dashboard/products")} className="mt-2">
            Return to Products Catalog
          </Button>
        </div>
      </div>
    );
  }

  // Derive metrics
  const totalStock = product.variants.reduce((acc, v) => acc + (v.inventory.quantityOnHand ?? 0), 0);
  const statusBadge = getStatusBadgeProps(product.status);
  const minPriceMinor = Math.min(...product.variants.map((v) => v.price.amountMinor));
  const maxPriceMinor = Math.max(...product.variants.map((v) => v.price.amountMinor));
  const priceDisplay =
    minPriceMinor === maxPriceMinor
      ? formatPkr(minPriceMinor)
      : `${formatPkr(minPriceMinor)} – ${formatPkr(maxPriceMinor)}`;

  // Convert Product to ProductListItem shape for edit/archive dialog compatibility
  const productListItemShape: ProductListItem = {
    id: product.id,
    sellerId: product.sellerId,
    workspaceId: product.workspaceId,
    title: product.title,
    slug: product.slug,
    status: product.status,
    tags: product.tags,
    categoryIds: product.categoryIds,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    archivedAt: product.archivedAt,
    primaryImage: null,
    variantCount: product.variants.length,
    priceRange: {
      min: { amountMinor: minPriceMinor, currency: "PKR" },
      max: { amountMinor: maxPriceMinor, currency: "PKR" },
    },
    inventoryState: product.variants.some((v) => v.inventory.state === "in_stock")
      ? "in_stock"
      : product.variants.some((v) => v.inventory.state === "low_stock")
        ? "low_stock"
        : "out_of_stock",
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Navigation & Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Link
            href="/dashboard/products"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-1"
          >
            <ArrowLeft className="size-3.5" />
            Back to Products Catalog
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {product.title}
            </h1>
            <StatusBadge label={statusBadge.label} tone={statusBadge.tone} />
          </div>
          <p className="text-xs text-muted-foreground font-mono">SKU ID: {product.slug}</p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsFormOpen(true)}>
            <Edit className="size-4 mr-1.5" />
            Edit Product
          </Button>

          {product.status !== "archived" ? (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setIsArchiveOpen(true)}
            >
              <Archive className="size-4 mr-1.5" />
              Archive
            </Button>
          ) : null}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Catalog Price"
          value={priceDisplay}
          helperText={product.variants.length > 1 ? "Across all variant options" : "Standard selling price"}
        />
        <MetricCard
          label="Total Variants"
          value={`${product.variants.length} SKU${product.variants.length === 1 ? "" : "s"}`}
          helperText="Unique purchasable options"
        />
        <MetricCard
          label="Total Stock on Hand"
          value={`${totalStock} Units`}
          helperText="Available physical stock"
        />
        <MetricCard
          label="Catalog Status"
          value={product.status === "active" ? "Live" : product.status}
          helperText="Published to sales channels"
        />
      </div>

      {/* Main Grid: Left Column (Variants & Details) + Right Column (Multi-Store Channels & Metadata) */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left Section (8 cols): Variants Table & Details */}
        <div className="xl:col-span-8 flex flex-col gap-6">
          {/* Variants Breakdown Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <Layers className="size-5 text-muted-foreground" />
                    Product Variants & Stock
                  </CardTitle>
                  <CardDescription>
                    Individual purchasable units with separate SKUs, prices, and warehouse counts.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Variant Name</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Price (PKR)</TableHead>
                    <TableHead>Stock Level</TableHead>
                    <TableHead>Health</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {product.variants.map((variant) => {
                    const inv = getInventoryBadgeProps(variant.inventory.state);
                    return (
                      <TableRow key={variant.id}>
                        <TableCell className="font-medium">
                          <div className="flex flex-col">
                            <span>{variant.title}</span>
                            {variant.optionValues && variant.optionValues.length > 0 ? (
                              <span className="text-xs text-muted-foreground">
                                {variant.optionValues.map((o) => `${o.optionName}: ${o.value}`).join(" • ")}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {variant.sku ?? "—"}
                        </TableCell>
                        <TableCell className="font-semibold">
                          {formatPkr(variant.price.amountMinor)}
                          {variant.compareAtPrice ? (
                            <span className="text-xs line-through text-muted-foreground ml-1.5">
                              {formatPkr(variant.compareAtPrice.amountMinor)}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {variant.inventory.trackInventory ? (
                            <div className="flex flex-col">
                              <span>{variant.inventory.quantityOnHand ?? 0} on hand</span>
                              {variant.inventory.lowStockThreshold ? (
                                <span className="text-[11px] text-muted-foreground">
                                  Alert at {variant.inventory.lowStockThreshold}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not tracked</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge label={inv.label} tone={inv.tone} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Description & Categorization Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Product Description & Categorization</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Description
                </h4>
                <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">
                  {product.description || "No detailed description added yet. Edit this product to add customer-facing details."}
                </p>
              </div>

              {product.tags && product.tags.length > 0 ? (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Tags
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {product.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* Right Section (4 cols): Multi-Store Sync & System Info */}
        <div className="xl:col-span-4 flex flex-col gap-6">
          {/* Multi-Store Channels Card */}
          <Card className="border-primary/20 bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="size-4" />
                <CardTitle className="text-base font-semibold">Store Sync Channels</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Future multi-store connectivity status for this item.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3.5">
              {/* Central Catalog */}
              <div className="flex items-center justify-between rounded-lg border p-2.5 bg-background">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-7 items-center justify-center rounded-md bg-green-500/10 text-green-700 dark:text-green-300">
                    <CheckCircle2 className="size-4" />
                  </div>
                  <div>
                    <p className="font-medium text-xs">PakCommerce Central</p>
                    <p className="text-[11px] text-muted-foreground">Master inventory ledger</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[11px] text-green-700 bg-green-500/10 border-transparent">
                  Source of Truth
                </Badge>
              </div>

              {/* Shopify Channel */}
              <div className="flex items-center justify-between rounded-lg border p-2.5 bg-background">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <ShoppingBag className="size-4" />
                  </div>
                  <div>
                    <p className="font-medium text-xs">Shopify Store</p>
                    <p className="text-[11px] text-muted-foreground">Automatic SKU sync</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[11px] border-dashed text-muted-foreground font-normal">
                  Ready to Sync
                </Badge>
              </div>

              {/* WooCommerce Channel */}
              <div className="flex items-center justify-between rounded-lg border p-2.5 bg-background">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Package className="size-4" />
                  </div>
                  <div>
                    <p className="font-medium text-xs">WooCommerce</p>
                    <p className="text-[11px] text-muted-foreground">Inventory sync</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[11px] border-dashed text-muted-foreground font-normal">
                  Ready to Sync
                </Badge>
              </div>

              {/* WhatsApp Sales Agent */}
              <div className="flex items-center justify-between rounded-lg border p-2.5 bg-background">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-7 items-center justify-center rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-300">
                    <Sparkles className="size-4" />
                  </div>
                  <div>
                    <p className="font-medium text-xs">WhatsApp AI Agent</p>
                    <p className="text-[11px] text-muted-foreground">Conversational sales</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[11px] text-blue-700 bg-blue-500/10 border-transparent">
                  In Catalog
                </Badge>
              </div>

              <div className="rounded-lg bg-muted/40 p-2.5 text-[11px] text-muted-foreground leading-normal">
                When you connect your stores in <strong>Settings → Integrations</strong>, this catalog product will automatically propagate to external channels with real-time stock sync.
              </div>
            </CardContent>
          </Card>

          {/* Audit & Timestamps Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Audit & Timestamps</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="size-3.5" />
                  Created At
                </span>
                <span className="font-medium text-foreground">
                  {new Date(product.createdAt).toLocaleDateString("en-PK", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  Last Updated
                </span>
                <span className="font-medium text-foreground">
                  {new Date(product.updatedAt).toLocaleDateString("en-PK", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>

              <div className="flex items-center justify-between border-t pt-2 text-[11px]">
                <span className="text-muted-foreground">Product ID</span>
                <span className="font-mono text-muted-foreground truncate max-w-[150px]">{product.id}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Product Modal */}
      {isFormOpen ? (
        <ProductFormDialog
          key={`edit-${product.id}`}
          open={isFormOpen}
          onOpenChange={setIsFormOpen}
          workspaceId={product.workspaceId}
          productToEdit={productListItemShape}
          onSuccess={reloadProduct}
        />
      ) : null}

      {/* Archive Product Modal */}
      <ProductArchiveDialog
        product={productListItemShape}
        open={isArchiveOpen}
        onOpenChange={setIsArchiveOpen}
        onSuccess={() => {
          router.push("/dashboard/products");
        }}
      />
    </div>
  );
}
