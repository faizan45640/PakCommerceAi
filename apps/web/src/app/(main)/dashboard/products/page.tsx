"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Package, Plus, RefreshCw } from "lucide-react";
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
import { ProductFormDialog } from "./_components/product-form-dialog";
import { ProductKpiCards } from "./_components/product-kpi-cards";
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

  // Dialog States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<ProductListItem | null>(null);
  const [productToArchive, setProductToArchive] = useState<ProductListItem | null>(null);

  // Initial Workspace Load
  const loadWorkspace = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const ws = await fetchCurrentWorkspace();
      setWorkspace(ws);
      return ws;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unable to load workspace. Please sign in again.";
      setErrorMessage(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Products Load
  const loadProducts = useCallback(
    async (wsId: string) => {
      try {
        setIsProductsLoading(true);
        setErrorMessage(null);

        const statuses = statusFilter !== "all" ? [statusFilter] : undefined;
        const inventoryStates = stockFilter !== "all" ? [stockFilter] : undefined;

        const result = await fetchProducts({
          workspaceId: wsId,
          query: searchQuery || undefined,
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

  // Initial Boot
  useEffect(() => {
    void (async () => {
      const ws = await loadWorkspace();
      if (ws) {
        await loadProducts(ws.id);
      }
    })();
  }, [loadWorkspace, loadProducts]); // Run on mount

  // Reload products when filters change and workspace is known
  useEffect(() => {
    if (workspace) {
      const debounceTimer = setTimeout(() => {
        void loadProducts(workspace.id);
      }, 250);

      return () => clearTimeout(debounceTimer);
    }
  }, [workspace, loadProducts]);

  const handleRefresh = () => {
    if (workspace) {
      void loadProducts(workspace.id);
    } else {
      void loadWorkspace();
    }
  };

  const handleOpenAddDialog = () => {
    setProductToEdit(null);
    setIsFormOpen(true);
  };

  const handleOpenEditDialog = (product: ProductListItem) => {
    setProductToEdit(product);
    setIsFormOpen(true);
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
          <Button onClick={handleOpenAddDialog} className="shadow-xs">
            <Plus className="size-4 mr-1.5" />
            Add Product
          </Button>
        }
      />

      {/* KPI Overview */}
      <ProductKpiCards items={products} total={totalCount} />

      {/* Search and Filter Toolbar */}
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
              <Button size="sm" onClick={handleOpenAddDialog}>
                <Plus className="size-4 mr-1.5" />
                Add Your First Product
              </Button>
            )
          }
        />
      ) : (
        <ProductTable
          products={products}
          onEdit={handleOpenEditDialog}
          onArchive={(p) => setProductToArchive(p)}
        />
      )}

      {/* Product Form Modal (Add / Edit) */}
      {workspace && isFormOpen ? (
        <ProductFormDialog
          key={productToEdit ? `edit-${productToEdit.id}` : "create-new"}
          open={isFormOpen}
          onOpenChange={setIsFormOpen}
          workspaceId={workspace.id}
          productToEdit={productToEdit}
          onSuccess={handleRefresh}
        />
      ) : null}

      {/* Product Archive Confirmation Modal */}
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
