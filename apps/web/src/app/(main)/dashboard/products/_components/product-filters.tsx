"use client";

import { RefreshCw, Search, X } from "lucide-react";
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
}: ProductFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Search Input */}
      <div className="relative flex-1 sm:max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by title, SKU, tags..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 pr-8"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {/* Filter Dropdowns and Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={onStatusChange}>
          <SelectTrigger className="w-[130px]" size="sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Live (Active)</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>

        {/* Stock Filter */}
        <Select value={stockFilter} onValueChange={onStockChange}>
          <SelectTrigger className="w-[135px]" size="sm">
            <SelectValue placeholder="Stock" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stock</SelectItem>
            <SelectItem value="in_stock">In Stock</SelectItem>
            <SelectItem value="low_stock">Low Stock</SelectItem>
            <SelectItem value="out_of_stock">Out of Stock</SelectItem>
            <SelectItem value="untracked">Untracked</SelectItem>
          </SelectContent>
        </Select>

        {/* Sort Filter */}
        <Select value={sortBy} onValueChange={onSortChange}>
          <SelectTrigger className="w-[145px]" size="sm">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated_desc">Recently Updated</SelectItem>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="title_asc">Title (A-Z)</SelectItem>
            <SelectItem value="title_desc">Title (Z-A)</SelectItem>
            <SelectItem value="price_asc">Price (Low to High)</SelectItem>
            <SelectItem value="price_desc">Price (High to Low)</SelectItem>
          </SelectContent>
        </Select>

        {/* Refresh button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          title="Refresh products list"
        >
          <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>
    </div>
  );
}
