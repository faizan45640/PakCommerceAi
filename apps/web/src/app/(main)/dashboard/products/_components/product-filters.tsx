"use client";

import { AlertTriangle, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProductFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: string;
  onStatusChange: (status: string) => void;
  stockFilter: string;
  onStockChange: (stock: string) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
  totalCount?: number;
}

export function ProductFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  stockFilter,
  onStockChange,
  sortBy,
  onSortChange,
  onRefresh,
  isLoading,
  totalCount,
}: ProductFiltersProps) {
  const statusTabs = [
    {
      id: "all",
      label: "All Items",
      activeClass: "bg-black text-white dark:bg-white dark:text-black font-bold shadow-xs",
      inactiveClass: "text-muted-foreground hover:text-foreground hover:bg-muted/50",
    },
    {
      id: "active",
      label: "Active (Live)",
      dotColor: "bg-emerald-500",
      activeClass: "bg-emerald-600 text-white font-bold shadow-xs hover:bg-emerald-700",
      inactiveClass: "text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10",
    },
    {
      id: "draft",
      label: "Draft",
      dotColor: "bg-zinc-400",
      activeClass: "bg-zinc-800 text-white dark:bg-zinc-700 dark:text-white font-bold shadow-xs",
      inactiveClass: "text-muted-foreground hover:text-foreground hover:bg-muted/50",
    },
    {
      id: "archived",
      label: "Archived",
      dotColor: "bg-red-500",
      activeClass: "bg-red-600 text-white font-bold shadow-xs hover:bg-red-700",
      inactiveClass: "text-red-600 dark:text-red-400 hover:bg-red-500/10",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Polaris-Style Segmented View Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-1">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {statusTabs.map((tab) => {
            const isActive = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onStatusChange(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs rounded-lg transition-all ${
                  isActive ? tab.activeClass : tab.inactiveClass
                }`}
              >
                {tab.dotColor && !isActive ? (
                  <span className={`size-2 rounded-full ${tab.dotColor}`} />
                ) : null}
                <span>{tab.label}</span>
                {tab.id === "all" && typeof totalCount === "number" ? (
                  <span
                    className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${
                      isActive
                        ? "bg-white/20 text-white dark:bg-black/20 dark:text-black"
                        : "bg-muted text-muted-foreground font-semibold"
                    }`}
                  >
                    {totalCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Quick Stock Filter Chips (Polaris Quick Views) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onStockChange(stockFilter === "low_stock" ? "all" : "low_stock")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all ${
              stockFilter === "low_stock"
                ? "border-amber-500 bg-amber-500 text-black font-bold shadow-xs"
                : "border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 font-medium"
            }`}
          >
            <AlertTriangle className={`size-3.5 ${stockFilter === "low_stock" ? "text-black" : "text-amber-500"}`} />
            <span>Low Stock</span>
          </button>

          <button
            type="button"
            onClick={() => onStockChange(stockFilter === "out_of_stock" ? "all" : "out_of_stock")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all ${
              stockFilter === "out_of_stock"
                ? "border-red-600 bg-red-600 text-white font-bold shadow-xs"
                : "border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10 font-medium"
            }`}
          >
            <span className={`size-2 rounded-full ${stockFilter === "out_of_stock" ? "bg-white" : "bg-red-600"}`} />
            <span>Out of Stock</span>
          </button>

          {stockFilter !== "all" ? (
            <button
              type="button"
              onClick={() => onStockChange("all")}
              className="text-[11px] text-muted-foreground hover:text-foreground underline px-1 font-medium"
            >
              Reset
            </button>
          ) : null}
        </div>
      </div>

      {/* Search and Secondary Filter Controls Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search Input */}
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter products by title, SKU, or tags..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 pr-8 text-xs bg-background/50 shadow-2xs"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        {/* Sort and Refresh */}
        <div className="flex items-center gap-2">
          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger className="w-[155px] text-xs" size="sm">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated_desc">Recently Updated</SelectItem>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="title_asc">Title (A-Z)</SelectItem>
              <SelectItem value="title_desc">Title (Z-A)</SelectItem>
              <SelectItem value="price_asc">Price: Low to High</SelectItem>
              <SelectItem value="price_desc">Price: High to Low</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
            className="h-8 px-2.5"
            title="Refresh product catalogue"
          >
            <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
    </div>
  );
}
