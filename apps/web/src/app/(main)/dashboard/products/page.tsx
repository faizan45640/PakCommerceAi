"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ChevronUp, Package, Plus, RefreshCw } from "lucide-react";
import type { ProductListItem, Workspace } from "@pakcommerce/shared";

import { EmptyState } from "@/components/dashboard/empty-state";
import { LoadingState } from "@/components/dashboard/loading-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import {
  fetchCurrentWorkspace,
  fetchProducts,
} from "@/lib/api/products";

import { ProductArchiveDialog } from "./_components/product-archive-dialog";
import { ProductFilters } from "./_components/product-filters";
import { ProductKpiCards } from "./_components/product-kpi-cards";
import { ProductStudio } from "./_components/product-studio";
import { ProductTable } from "./_components/product-table";

export default function ProductsPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [sortBy, setSortBy] = useState("updated_desc");

  // UI States
  const [isLoading, setIsLoading] = useState(true);
  const [isProductsLoading, setIsProductsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Product Studio (In-Page Collapsible Section)
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<ProductListItem | null>(null);
  const studioRef = useRef<HTMLDivElement | null>(null);

  // Archive Dialog State
  const [productToArchive, setProductToArchive] = useState<ProductListItem | null>(null);

  // 1. Initial Boot: Load Workspace ONCE on mount
  useEffect(() => {
    let ignore = false;
    async function initWorkspace() {
      try {
        setIsLoading(true);
        setErrorMessage(null);
        const ws = await fetchCurrentWorkspace();
        if (!ignore) {
          setWorkspace(ws);
        }
      } catch (err: unknown) {
        if (!ignore) {
          const msg = err instanceof Error ? err.message : "Unable to load workspace. Please sign in again.";
          setErrorMessage(msg);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }
    void initWorkspace();
    return () => {
      ignore = true;
    };
  }, []);

  // 2. Load Products whenever workspace or filters change (seamless in-place update)
  const loadProducts = useCallback(
    async (wsId: string) => {
      try {
        setIsProductsLoading(true);
        setErrorMessage(null);

        const statuses = statusFilter !== "all" ? [statusFilter] : undefined;
        const inventoryStates = stockFilter !== "all" ? [stockFilter] : undefined;

        const result = await fetchProducts({
          workspaceId: wsId,
          query: searchQuery.trim() || undefined,
          statuses,
          inventoryStates,
          sort: sortBy,
        });

        setProducts(result.items);
        setTotalCount(result.meta.total);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load products.";
        setErrorMessage(msg);
      } finally {
        setIsProductsLoading(false);
      }
    },
    [searchQuery, statusFilter, stockFilter, sortBy],
  );

  // Trigger product fetch when filters change (instant for tabs, debounced for text search)
  useEffect(() => {
    if (!workspace) return;

    const timer = setTimeout(
      () => {
        void loadProducts(workspace.id);
      },
      searchQuery ? 250 : 0,
    );

    return () => clearTimeout(timer);
  }, [workspace, loadProducts, searchQuery]);

  const handleRefresh = () => {
    if (workspace) {
      void loadProducts(workspace.id);
    }
  };

  const scrollToStudio = () => {
    setTimeout(() => {
      studioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const handleOpenAddStudio = () => {
    setProductToEdit(null);
    setIsStudioOpen(true);
    scrollToStudio();
  };

  const handleOpenEditStudio = (product: ProductListItem) => {
    setProductToEdit(product);
    setIsStudioOpen(true);
    scrollToStudio();
  };

  const handleCloseStudio = () => {
    setIsStudioOpen(false);
    setProductToEdit(null);
  };

  // Full Initial Page Loading State
  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Products"
          description="Manage catalog items across connected stores from one workspace."
        />
        <LoadingState rows={6} showMetrics={true} />
      </div>
    );
  }

  // Fatal Workspace Error State
  if (errorMessage && !workspace) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Products"
          description="Manage catalog items across connected stores from one workspace."
        />
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
          <AlertCircle className="size-10 text-destructive" />
          <div className="space-y-1">
            <h3 className="font-semibold text-base">Unable to connect to workspace</h3>
            <p className="max-w-md text-muted-foreground text-sm">{errorMessage}</p>
          </div>
          <Button onClick={handleRefresh} variant="outline" className="mt-2">
            <RefreshCw className="size-4 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header with Add Product CTA */}
      <PageHeader
        title="Products"
        description="Centralized product catalog. Items are ready to sync with Shopify, WooCommerce, and WhatsApp."
        actions={
          <div className="flex items-center gap-2">
            {isStudioOpen ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCloseStudio}
                className="text-xs"
              >
                <ChevronUp className="size-3.5 mr-1" />
                Close Studio
              </Button>
            ) : null}

            <Button onClick={handleOpenAddStudio} className="shadow-xs">
              <Plus className="size-4 mr-1.5" />
              Add Product
            </Button>
          </div>
        }
      />

      {/* KPI Overview */}
      <ProductKpiCards items={products} total={totalCount} />

      {/* In-Page Collapsible Product Studio (Shopify / Polaris 2-Column Experience) */}
      <div ref={studioRef}>
        {workspace && isStudioOpen ? (
          <ProductStudio
            key={productToEdit ? `edit-${productToEdit.id}` : "create-studio"}
            open={isStudioOpen}
            onClose={handleCloseStudio}
            workspaceId={workspace.id}
            productToEdit={productToEdit}
            onSuccess={() => {
              handleRefresh();
            }}
          />
        ) : null}
      </div>

      {/* Search and Polaris Segmented Filter Toolbar */}
      <ProductFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        stockFilter={stockFilter}
        onStockChange={setStockFilter}
        sortBy={sortBy}
        onSortChange={setSortBy}
        onRefresh={handleRefresh}
        isLoading={isProductsLoading}
        totalCount={totalCount}
      />

      {/* Content Area: Products Loading / Error / Empty / Table */}
      {isProductsLoading && products.length === 0 ? (
        <LoadingState rows={5} showMetrics={false} />
      ) : errorMessage ? (
        <div className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <Button size="sm" variant="outline" onClick={handleRefresh}>
            Retry
          </Button>
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          title={searchQuery || statusFilter !== "all" || stockFilter !== "all" ? "No matching products" : "No products yet"}
          description={
            searchQuery || statusFilter !== "all" || stockFilter !== "all"
              ? "Try adjusting your search query or filters to find what you're looking for."
              : "Start by adding your first product with prices in PKR and inventory counts. It will automatically be ready to sync to your stores."
          }
          icon={<Package className="size-6 text-muted-foreground" />}
          action={
            searchQuery || statusFilter !== "all" || stockFilter !== "all" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                  setStockFilter("all");
                }}
              >
                Reset Filters
              </Button>
            ) : (
              <Button size="sm" onClick={handleOpenAddStudio}>
                <Plus className="size-4 mr-1.5" />
                Add Your First Product
              </Button>
            )
          }
        />
      ) : (
        <ProductTable
          products={products}
          onEdit={handleOpenEditStudio}
          onArchive={(p) => setProductToArchive(p)}
        />
      )}

      {/* Product Archive Confirmation Modal (kept light & contextual) */}
      <ProductArchiveDialog
        product={productToArchive}
        open={Boolean(productToArchive)}
        onOpenChange={(open) => {
          if (!open) setProductToArchive(null);
        }}
        onSuccess={handleRefresh}
      />
    </div>
  );
}
