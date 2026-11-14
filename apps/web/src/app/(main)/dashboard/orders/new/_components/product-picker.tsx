"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import type { Product, ProductListItem } from "@pakcommerce/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchProductById, fetchProducts } from "@/lib/api/products";
import { formatPkr } from "@/lib/currency";

import { availableStock, type CartLine } from "./order-form";

interface ProductPickerProps {
  workspaceId: string;
  onAdd: (line: CartLine) => void;
}

export function ProductPicker({ workspaceId, onAdd }: ProductPickerProps) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  // Results are tagged with the query they answer, so "searching" is derived, not set in an effect.
  const [loaded, setLoaded] = useState<{ query: string; items: ProductListItem[]; error: string | null } | null>(
    null,
  );
  const [selected, setSelected] = useState<Product | null>(null);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let ignore = false;

    fetchProducts({ workspaceId, query: debounced, statuses: ["active"], sort: "newest", limit: 8 })
      .then((data) => {
        if (!ignore) setLoaded({ query: debounced, items: data.items, error: null });
      })
      .catch((err: unknown) => {
        if (!ignore) {
          setLoaded({
            query: debounced,
            items: [],
            error: err instanceof Error ? err.message : "Failed to search products.",
          });
        }
      });

    return () => {
      ignore = true;
    };
  }, [workspaceId, debounced]);

  const isSearching = loaded?.query !== debounced;
  const results = loaded?.items ?? [];

  async function selectProduct(item: ProductListItem) {
    setIsLoadingProduct(true);
    setProductError(null);
    try {
      setSelected(await fetchProductById(item.id));
    } catch (err: unknown) {
      setProductError(err instanceof Error ? err.message : "Failed to load product.");
    } finally {
      setIsLoadingProduct(false);
    }
  }

  function addVariant(product: Product, variantId: string) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (!variant) return;
    onAdd({
      productId: product.id,
      variantId: variant.id,
      productTitle: product.title,
      variantTitle: variant.title,
      sku: variant.sku ?? null,
      unitPriceMinor: variant.price.amountMinor,
      available: availableStock(variant),
      quantity: 1,
    });
  }

  const errorMessage = productError ?? loaded?.error ?? null;

  if (selected) {
    const variants = selected.variants.filter((v) => v.status === "active");
    return (
      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-sm">{selected.title}</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(null)}>
            Back to results
          </Button>
        </div>
        {variants.length === 0 ? (
          <p className="text-muted-foreground text-sm">This product has no active variants.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {variants.map((variant) => {
              const available = availableStock(variant);
              return (
                <li key={variant.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-sm">{variant.title}</p>
                    <p className="text-muted-foreground text-xs">
                      {variant.sku ? `SKU ${variant.sku} · ` : ""}
                      {formatPkr(variant.price.amountMinor)} ·{" "}
                      {available === null ? "Stock not tracked" : `${available} available`}
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={() => addVariant(selected, variant.id)}>
                    <Plus className="size-4" />
                    Add
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search active products by title or SKU"
          className="pl-9"
          aria-label="Search products"
        />
        {isSearching || isLoadingProduct ? (
          <Loader2 className="absolute top-2.5 right-3 size-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      {errorMessage ? <p className="text-destructive text-sm">{errorMessage}</p> : null}
      {!isSearching && !errorMessage && results.length === 0 ? (
        <p className="text-muted-foreground text-sm">No active products found.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {results.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => void selectProduct(item)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/40"
              >
                <span className="truncate font-medium text-sm">{item.title}</span>
                <span className="shrink-0 text-muted-foreground text-xs">
                  {item.variantCount} variant{item.variantCount === 1 ? "" : "s"} ·{" "}
                  {formatPkr(item.priceRange.min.amountMinor)}
                  {item.priceRange.max.amountMinor !== item.priceRange.min.amountMinor
                    ? ` – ${formatPkr(item.priceRange.max.amountMinor)}`
                    : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
