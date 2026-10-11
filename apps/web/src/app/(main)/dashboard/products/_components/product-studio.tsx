"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Package,
  Plus,
  Settings2,
  Share2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { CreateProductInput, ProductListItem, UpdateProductInput } from "@pakcommerce/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createProductApi, fetchProductById, updateProductApi } from "@/lib/api/products";
import { paisaToPkr, pkrToPaisa } from "@/lib/currency";

import { CategorySelector } from "./category-selector";
import { ImageStudio, type StudioImage } from "./image-studio";

interface VariantRow {
  id: string;
  name: string;
  price: string;
  compareAtPrice: string;
  sku: string;
  quantityOnHand: string;
  trackInventory: boolean;
}

interface ProductStudioProps {
  workspaceId: string;
  productToEdit?: ProductListItem | null;
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const COMMON_SIZES = ["Small", "Medium", "Large", "XL", "XXL"];
const COMMON_COLORS = ["Black", "White", "Navy Blue", "Maroon", "Olive Green", "Beige"];

export function ProductStudio({
  workspaceId,
  productToEdit,
  open,
  isOpen,
  onClose,
  onSuccess,
}: ProductStudioProps) {
  const isEditing = Boolean(productToEdit);

  // Core Essentials
  const [title, setTitle] = useState(() => productToEdit?.title ?? "");
  const [slug, setSlug] = useState(() => productToEdit?.slug ?? "");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>(() => productToEdit?.tags ?? []);
  const [currentTagInput, setCurrentTagInput] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(
    () => productToEdit?.categoryIds ?? [],
  );
  const [images, setImages] = useState<StudioImage[]>([]);
  const [vendor, setVendor] = useState("");
  const [status, setStatus] = useState<"draft" | "active">(() =>
    productToEdit?.status === "archived" ? "draft" : (productToEdit?.status as "draft" | "active") ?? "active",
  );

  // Pricing & Stock
  const [singlePrice, setSinglePrice] = useState(() =>
    productToEdit ? String(paisaToPkr(productToEdit.priceRange.min.amountMinor)) : "",
  );
  const [singleCompareAt, setSingleCompareAt] = useState("");
  const [singleStock, setSingleStock] = useState("");

  // Advanced fields (Collapsible)
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [singleCost, setSingleCost] = useState("");
  const [singleSku, setSingleSku] = useState("");
  const [singleBarcode, setSingleBarcode] = useState("");
  const [singleLowStockThreshold, setSingleLowStockThreshold] = useState("5");
  const [singleTrackInventory, setSingleTrackInventory] = useState(true);

  // Variants (Sizes / Colors)
  const [hasVariants, setHasVariants] = useState(false);
  const [optionName, setOptionName] = useState<"Size" | "Color" | "Option">("Size");
  const [variants, setVariants] = useState<VariantRow[]>([
    {
      id: "v-1",
      name: "",
      price: "",
      compareAtPrice: "",
      sku: "",
      quantityOnHand: "0",
      trackInventory: true,
    },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(() => Boolean(productToEdit));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-slug generator
  const generatedSlug = useMemo(() => {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }, [title]);

  // Margin stats
  const marginStats = useMemo(() => {
    const priceNum = parseFloat(singlePrice) || 0;
    const costNum = parseFloat(singleCost) || 0;
    const compareAtNum = parseFloat(singleCompareAt) || 0;

    const profit = priceNum - costNum;
    const marginPercent = priceNum > 0 ? (profit / priceNum) * 100 : 0;
    const discountPercent =
      compareAtNum > priceNum && compareAtNum > 0
        ? Math.round(((compareAtNum - priceNum) / compareAtNum) * 100)
        : 0;

    return {
      profit,
      marginPercent: Math.max(0, Math.round(marginPercent)),
      discountPercent,
      isProfitable: profit > 0,
      hasCost: costNum > 0,
    };
  }, [singlePrice, singleCost, singleCompareAt]);

  // Load product details when editing
  useEffect(() => {
    if (!productToEdit) return;

    let ignore = false;

    fetchProductById(productToEdit.id)
      .then((fullProduct) => {
        if (ignore) return;
        setDescription(fullProduct.description ?? "");
        if (fullProduct.images && fullProduct.images.length > 0) {
          setImages(fullProduct.images);
        }
        if (fullProduct.categoryIds && fullProduct.categoryIds.length > 0) {
          setSelectedCategoryIds(fullProduct.categoryIds);
        }
        if (fullProduct.variants && fullProduct.variants.length > 1) {
          setHasVariants(true);
          setVariants(
            fullProduct.variants.map((v, i) => ({
              id: v.id || `v-${i}`,
              name: v.title,
              price: String(paisaToPkr(v.price.amountMinor)),
              compareAtPrice: v.compareAtPrice ? String(paisaToPkr(v.compareAtPrice.amountMinor)) : "",
              sku: v.sku ?? "",
              quantityOnHand: String(v.inventory?.quantityOnHand ?? 0),
              trackInventory: v.inventory?.trackInventory ?? true,
            })),
          );
        } else if (fullProduct.variants && fullProduct.variants.length === 1) {
          const v0 = fullProduct.variants[0];
          setHasVariants(false);
          setSingleSku(v0.sku ?? "");
          setSingleBarcode(v0.barcode ?? "");
          setSinglePrice(String(paisaToPkr(v0.price.amountMinor)));
          if (v0.compareAtPrice) {
            setSingleCompareAt(String(paisaToPkr(v0.compareAtPrice.amountMinor)));
          }
          if (v0.inventory) {
            setSingleStock(String(v0.inventory.quantityOnHand ?? 0));
            setSingleTrackInventory(v0.inventory.trackInventory);
            setSingleLowStockThreshold(String(v0.inventory.lowStockThreshold ?? 5));
          }
        }
      })
      .catch((err) => {
        if (!ignore) {
          console.error("Failed to load full product details:", err);
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsLoadingDetails(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [productToEdit]);

  const handleAddTag = () => {
    const trimmed = currentTagInput.trim().replace(/^#/, "");
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setCurrentTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  // AI Assistant for local Pakistani commerce
  const handleAiAutoDescription = () => {
    if (!title.trim()) {
      toast.info("Please enter a product title first.");
      return;
    }
    const sample = `${title.trim()} — crafted with premium materials for everyday style and durability.\n\n• 100% Quality Guaranteed\n• Cash on Delivery (COD) Available Nationwide\n• Fast 2–3 Days Courier Dispatch across Pakistan (TCS, Leopards, Trax)\n• Easy 7-day Exchange Policy`;
    setDescription(sample);
    toast.success("Generated draft description tailored for Pakistani buyers.");
  };

  // Quick chip addition for sizes / colors
  const handleQuickAddOption = (optionValue: string) => {
    if (variants.some((v) => v.name.toLowerCase() === optionValue.toLowerCase())) {
      toast.info(`"${optionValue}" is already in the list.`);
      return;
    }

    setVariants((prev) => {
      // If the first row is empty, overwrite it
      if (prev.length === 1 && !prev[0].name.trim()) {
        return [
          {
            ...prev[0],
            name: optionValue,
            price: prev[0].price || singlePrice || "",
            quantityOnHand: prev[0].quantityOnHand || singleStock || "10",
          },
        ];
      }
      return [
        ...prev,
        {
          id: `v-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          name: optionValue,
          price: singlePrice || "",
          compareAtPrice: singleCompareAt || "",
          sku: "",
          quantityOnHand: singleStock || "10",
          trackInventory: true,
        },
      ];
    });
  };

  const handleAddVariantRow = () => {
    setVariants((prev) => [
      ...prev,
      {
        id: `v-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        name: "",
        price: singlePrice || "",
        compareAtPrice: singleCompareAt || "",
        sku: "",
        quantityOnHand: "0",
        trackInventory: true,
      },
    ]);
  };

  const handleRemoveVariantRow = (id: string) => {
    if (variants.length <= 1) {
      toast.info("You must have at least one variant, or turn off multiple options.");
      return;
    }
    setVariants((prev) => prev.filter((v) => v.id !== id));
  };

  const handleUpdateVariantField = (id: string, field: keyof VariantRow, value: unknown) => {
    setVariants((prev) =>
      prev.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    );
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!title.trim()) {
      setErrorMessage("Product title is required.");
      toast.error("Please enter a product title.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditing && productToEdit) {
        const imagesPayload = images.map((img, idx) => ({
          url: img.url,
          altText: img.altText ?? null,
          position: idx,
          isPrimary: img.isPrimary,
        }));

        const updateInput: UpdateProductInput = {
          title: title.trim(),
          slug: (slug.trim() || generatedSlug) || undefined,
          description: description.trim() || null,
          status,
          tags,
          categoryIds: selectedCategoryIds,
          images: imagesPayload,
        };

        await updateProductApi(productToEdit.id, updateInput);
        toast.success(`Updated "${title}" successfully.`);
      } else {
        let variantsPayload;

        if (hasVariants) {
          variantsPayload = variants.map((v, index) => {
            const priceVal = parseFloat(v.price);
            if (isNaN(priceVal) || priceVal < 0) {
              throw new Error(`Variant "${v.name || `#${index + 1}`}" has an invalid price.`);
            }

            const compareVal = v.compareAtPrice ? parseFloat(v.compareAtPrice) : null;
            const stockQty = parseInt(v.quantityOnHand, 10);

            return {
              title: v.name.trim() || `Variant ${index + 1}`,
              sku: v.sku.trim() || null,
              barcode: null,
              status: "active" as const,
              price: {
                amountMinor: pkrToPaisa(priceVal),
                currency: "PKR" as const,
              },
              compareAtPrice:
                compareVal !== null && !isNaN(compareVal)
                  ? { amountMinor: pkrToPaisa(compareVal), currency: "PKR" as const }
                  : null,
              optionValues: [
                {
                  optionName: optionName.trim() || "Option",
                  value: v.name.trim() || `Variant ${index + 1}`,
                },
              ],
              inventory: {
                trackInventory: v.trackInventory,
                quantityOnHand: isNaN(stockQty) ? 0 : stockQty,
                lowStockThreshold: 5,
                state:
                  stockQty <= 0
                    ? ("out_of_stock" as const)
                    : stockQty < 5
                    ? ("low_stock" as const)
                    : ("in_stock" as const),
              },
              position: index,
            };
          });
        } else {
          const priceVal = parseFloat(singlePrice);
          if (isNaN(priceVal) || priceVal < 0) {
            throw new Error("Please enter a valid selling price in PKR.");
          }

          const compareVal = singleCompareAt ? parseFloat(singleCompareAt) : null;
          const stockQty = parseInt(singleStock, 10) || 0;
          const thresholdVal = parseInt(singleLowStockThreshold, 10) || 5;

          variantsPayload = [
            {
              title: "Default",
              sku: singleSku.trim() || null,
              barcode: singleBarcode.trim() || null,
              status: "active" as const,
              price: {
                amountMinor: pkrToPaisa(priceVal),
                currency: "PKR" as const,
              },
              compareAtPrice:
                compareVal !== null && !isNaN(compareVal)
                  ? { amountMinor: pkrToPaisa(compareVal), currency: "PKR" as const }
                  : null,
              optionValues: [],
              inventory: {
                trackInventory: singleTrackInventory,
                quantityOnHand: isNaN(stockQty) ? 0 : stockQty,
                lowStockThreshold: thresholdVal,
                state:
                  stockQty <= 0
                    ? ("out_of_stock" as const)
                    : stockQty <= thresholdVal
                    ? ("low_stock" as const)
                    : ("in_stock" as const),
              },
              position: 0,
            },
          ];
        }

        const createInput: CreateProductInput = {
          workspaceId,
          title: title.trim(),
          slug: (slug.trim() || generatedSlug) || undefined,
          description: description.trim() || null,
          status,
          tags,
          categoryIds: selectedCategoryIds,
          options: hasVariants
            ? [
                {
                  name: optionName.trim() || "Option",
                  values: variants.map((v) => v.name.trim() || "Default"),
                  position: 0,
                },
              ]
            : [],
          variants: variantsPayload,
          images: images.map((img, idx) => ({
            url: img.url,
            altText: img.altText ?? null,
            position: idx,
            isPrimary: img.isPrimary,
          })),
        };

        await createProductApi(createInput);
        toast.success(`Product "${title}" added to store!`);
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save product.";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isStudioOpen = open ?? isOpen ?? true;
  if (!isStudioOpen) return null;

  return (
    <div className="mb-6 rounded-2xl border bg-card shadow-sm overflow-hidden transition-all duration-300">
      {/* Studio Header */}
      <div className="flex flex-col gap-2 border-b bg-muted/30 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold text-xs shadow-2xs">
              <Package className="size-4" />
            </span>
            <h2 className="text-lg font-bold text-foreground tracking-tight">
              {isEditing ? `Edit: ${productToEdit?.title}` : "Add New Product"}
            </h2>
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {isEditing ? "Editing Mode" : "Quick Add"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fill in the essentials below to list your item on your online store and WhatsApp catalog.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
            <X className="size-4 mr-1" />
            Close
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={(e) => void handleSubmit(e)}
            disabled={isSubmitting || isLoadingDetails}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-2xs"
          >
            {isSubmitting ? (
              <Loader2 className="size-3.5 animate-spin mr-1.5" />
            ) : (
              <CheckCircle2 className="size-3.5 mr-1.5" />
            )}
            {isEditing ? "Save Changes" : "Save & Publish"}
          </Button>
        </div>
      </div>

      {isLoadingDetails ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-primary mb-3" />
          <p className="text-sm">Loading complete product details...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="p-6">
          {errorMessage ? (
            <div className="mb-6 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertCircle className="size-5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          ) : null}

          {/* 2-Column Clean Layout */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* LEFT COLUMN: Essentials (~65% / 8 cols) */}
            <div className="flex flex-col gap-5 lg:col-span-8">
              {/* 1. Title & Description Card */}
              <Card className="border-border/70 shadow-2xs">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Product Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="product-title" className="text-xs font-semibold">
                      Product Title <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="product-title"
                      placeholder="e.g. Stitched Lawn Kurta - Navy Blue"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="mt-1.5 font-medium"
                      autoFocus={!isEditing}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <Label htmlFor="product-description" className="text-xs font-semibold">
                        Description
                      </Label>
                      <button
                        type="button"
                        onClick={handleAiAutoDescription}
                        className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
                      >
                        <Sparkles className="size-3" />
                        AI Auto-fill (COD & Delivery Notes)
                      </button>
                    </div>
                    <Textarea
                      id="product-description"
                      placeholder="Fabric details, sizing guidance, wash care, etc..."
                      rows={4}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="resize-y text-xs leading-relaxed"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* 2. Product Images (Main & Gallery) */}
              <ImageStudio images={images} onChange={setImages} />

              {/* 2. Pricing & Stock (The Core Numbers) */}
              <Card className="border-border/70 shadow-2xs">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">Price & Stock</CardTitle>
                    {marginStats.discountPercent > 0 ? (
                      <span className="rounded-full bg-rose-500/10 text-rose-600 px-2 py-0.5 text-[11px] font-bold">
                        Save {marginStats.discountPercent}% OFF
                      </span>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <Label htmlFor="price-pkr" className="text-xs font-semibold">
                        Selling Price (PKR) <span className="text-destructive">*</span>
                      </Label>
                      <div className="relative mt-1.5">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                          Rs.
                        </span>
                        <Input
                          id="price-pkr"
                          type="number"
                          min="0"
                          placeholder="2499"
                          value={singlePrice}
                          onChange={(e) => setSinglePrice(e.target.value)}
                          className="pl-9 font-semibold text-foreground text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="compare-price-pkr" className="text-xs font-medium text-muted-foreground">
                        Original / Struck Price
                      </Label>
                      <div className="relative mt-1.5">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          Rs.
                        </span>
                        <Input
                          id="compare-price-pkr"
                          type="number"
                          min="0"
                          placeholder="2999"
                          value={singleCompareAt}
                          onChange={(e) => setSingleCompareAt(e.target.value)}
                          className="pl-9 text-xs"
                        />
                      </div>
                    </div>

                    {!hasVariants && (
                      <div>
                        <Label htmlFor="product-stock" className="text-xs font-semibold">
                          Available Stock (Quantity)
                        </Label>
                        <Input
                          id="product-stock"
                          type="number"
                          min="0"
                          placeholder="e.g. 20"
                          value={singleStock}
                          onChange={(e) => setSingleStock(e.target.value)}
                          className="mt-1.5 font-semibold text-xs"
                        />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 3. Sizes & Colors (Variants) */}
              {!isEditing && (
                <Card className="border-border/70 shadow-2xs">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm font-semibold">Sizes or Colors</CardTitle>
                        <CardDescription className="text-xs">
                          Does this product come in multiple sizes, colors, or materials?
                        </CardDescription>
                      </div>
                      <Switch checked={hasVariants} onCheckedChange={setHasVariants} />
                    </div>
                  </CardHeader>

                  {hasVariants && (
                    <CardContent className="space-y-3.5 pt-0">
                      {/* Option selector and quick-add chips */}
                      <div className="rounded-lg bg-muted/30 p-3 space-y-2 border">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold">Option Type:</Label>
                          <div className="flex gap-2">
                            {(["Size", "Color", "Option"] as const).map((type) => (
                              <button
                                key={type}
                                type="button"
                                onClick={() => setOptionName(type)}
                                className={`text-xs px-2.5 py-0.5 rounded-full font-medium transition-colors ${
                                  optionName === type
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                {type}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Quick-add chips */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[11px] text-muted-foreground mr-1">Quick Add:</span>
                          {(optionName === "Size" ? COMMON_SIZES : COMMON_COLORS).map((chip) => (
                            <button
                              key={chip}
                              type="button"
                              onClick={() => handleQuickAddOption(chip)}
                              className="inline-flex items-center gap-0.5 rounded border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
                            >
                              <Plus className="size-2.5" />
                              {chip}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Variant Rows Table */}
                      <div className="rounded-lg border overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b bg-muted/40 font-semibold text-muted-foreground">
                            <tr>
                              <th className="p-2.5">{optionName} Name</th>
                              <th className="p-2.5">Price (PKR)</th>
                              <th className="p-2.5">Stock</th>
                              <th className="p-2.5 text-right">Remove</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/40">
                            {variants.map((v) => (
                              <tr key={v.id}>
                                <td className="p-2">
                                  <Input
                                    value={v.name}
                                    placeholder={`e.g. ${optionName === "Size" ? "Medium" : "Black"}`}
                                    onChange={(e) =>
                                      handleUpdateVariantField(v.id, "name", e.target.value)
                                    }
                                    className="h-8 text-xs font-medium"
                                  />
                                </td>
                                <td className="p-2">
                                  <div className="relative">
                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                                      Rs.
                                    </span>
                                    <Input
                                      type="number"
                                      value={v.price}
                                      placeholder="2499"
                                      onChange={(e) =>
                                        handleUpdateVariantField(v.id, "price", e.target.value)
                                      }
                                      className="h-8 pl-8 text-xs font-semibold"
                                    />
                                  </div>
                                </td>
                                <td className="p-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    value={v.quantityOnHand}
                                    onChange={(e) =>
                                      handleUpdateVariantField(v.id, "quantityOnHand", e.target.value)
                                    }
                                    className="h-8 w-24 text-xs font-semibold"
                                  />
                                </td>
                                <td className="p-2 text-right">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleRemoveVariantRow(v.id)}
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddVariantRow}
                        className="w-full text-xs border-dashed gap-1 h-8"
                      >
                        <Plus className="size-3.5" />
                        + Add Custom Row
                      </Button>
                    </CardContent>
                  )}
                </Card>
              )}

              {/* 4. Collapsible Advanced Details (Clean & Tucked Away) */}
              <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-3 text-xs font-semibold text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Settings2 className="size-4 text-primary" />
                      <span>Advanced Settings (SKU, Barcode, COGS, URL & SEO)</span>
                    </div>
                    {isAdvancedOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-4">
                  <Card className="border-border/70 shadow-2xs">
                    <CardContent className="space-y-4 pt-4">
                      {/* SKU & Barcode */}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <Label htmlFor="product-sku" className="text-xs font-medium">
                            SKU Code
                          </Label>
                          <Input
                            id="product-sku"
                            placeholder="e.g. KURTA-001"
                            value={singleSku}
                            onChange={(e) => setSingleSku(e.target.value)}
                            className="mt-1 h-8 font-mono text-xs uppercase"
                          />
                        </div>
                        <div>
                          <Label htmlFor="product-barcode" className="text-xs font-medium">
                            Barcode / EAN
                          </Label>
                          <Input
                            id="product-barcode"
                            placeholder="e.g. 896400012345"
                            value={singleBarcode}
                            onChange={(e) => setSingleBarcode(e.target.value)}
                            className="mt-1 h-8 text-xs font-mono"
                          />
                        </div>
                      </div>

                      {/* Cost per item & Profit Margin */}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-2 border-t">
                        <div>
                          <Label htmlFor="cost-pkr" className="text-xs font-medium">
                            Cost Price (COGS)
                          </Label>
                          <div className="relative mt-1">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                              Rs.
                            </span>
                            <Input
                              id="cost-pkr"
                              type="number"
                              min="0"
                              placeholder="1200"
                              value={singleCost}
                              onChange={(e) => setSingleCost(e.target.value)}
                              className="pl-8 h-8 text-xs"
                            />
                          </div>
                        </div>

                        <div>
                          <Label className="text-xs font-medium">Estimated Profit</Label>
                          <div className="mt-1 flex h-8 items-center rounded-md bg-muted/40 px-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            Rs. {marginStats.profit > 0 ? marginStats.profit.toLocaleString() : "0"} (
                            {marginStats.marginPercent}% margin)
                          </div>
                        </div>
                      </div>

                      {/* URL Slug */}
                      <div className="pt-2 border-t">
                        <Label className="text-xs font-medium">Custom Storefront URL Slug</Label>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-muted-foreground font-mono text-xs">/products/</span>
                          <Input
                            value={slug}
                            placeholder={generatedSlug || "product-slug"}
                            onChange={(e) => setSlug(e.target.value)}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            </div>

            {/* RIGHT SIDEBAR: Status & Organization (~35% / 4 cols) */}
            <div className="flex flex-col gap-5 lg:col-span-4">
              {/* 1. Product Status Card */}
              <Card className="border-border/70 shadow-2xs">
                <CardHeader className="pb-2.5">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Select value={status} onValueChange={(val: "draft" | "active") => setStatus(val)}>
                    <SelectTrigger className="w-full font-medium h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">
                        <div className="flex items-center gap-2">
                          <span className="size-2 rounded-full bg-emerald-500" />
                          <span className="font-semibold text-foreground">Active (Live in Store)</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="draft">
                        <div className="flex items-center gap-2">
                          <span className="size-2 rounded-full bg-zinc-400" />
                          <span>Draft (Hidden)</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                    <Share2 className="size-3.5 shrink-0" />
                    <span>Syncs with Online Store & WhatsApp Catalog</span>
                  </div>
                </CardContent>
              </Card>

              {/* 2. Category & Organization Card */}
              <Card className="border-border/70 shadow-2xs">
                <CardHeader className="pb-2.5">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Organization
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Clean Category Selector */}
                  <CategorySelector
                    workspaceId={workspaceId}
                    selectedCategoryIds={selectedCategoryIds}
                    onChange={setSelectedCategoryIds}
                  />

                  {/* Brand / Vendor */}
                  <div>
                    <Label className="text-xs font-semibold">Brand / Vendor (Optional)</Label>
                    <Input
                      placeholder="e.g. Khaadi, Sapphire, J."
                      value={vendor}
                      onChange={(e) => setVendor(e.target.value)}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>

                  {/* Tags */}
                  <div>
                    <Label className="text-xs font-semibold">Tags</Label>
                    <div className="flex gap-1.5 mt-1">
                      <Input
                        placeholder="e.g. lawn, summer, eid"
                        value={currentTagInput}
                        onChange={(e) => setCurrentTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddTag();
                          }
                        }}
                        className="h-8 text-xs"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={handleAddTag} className="h-8 text-xs">
                        Add
                      </Button>
                    </div>

                    {/* Tag chips */}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {tags.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground"
                          >
                            #{t}
                            <button
                              type="button"
                              onClick={() => handleRemoveTag(t)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <X className="size-2.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Bottom Action Bar */}
          <div className="mt-8 flex items-center justify-end gap-3 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || isLoadingDetails}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 shadow-2xs"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4 mr-2" />
                  {isEditing ? "Save Changes" : "Publish Product"}
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
