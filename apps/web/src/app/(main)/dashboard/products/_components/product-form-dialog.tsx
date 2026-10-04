"use client";

import { useState } from "react";
import { AlertCircle, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CreateProductInput, ProductListItem } from "@pakcommerce/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { createProductApi, updateProductApi } from "@/lib/api/products";
import { paisaToPkr, pkrToPaisa } from "@/lib/currency";

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  productToEdit?: ProductListItem | null;
  onSuccess: () => void;
}

interface VariantRow {
  id: string;
  name: string;
  price: string;
  compareAtPrice: string;
  sku: string;
  quantityOnHand: string;
  trackInventory: boolean;
}

export function ProductFormDialog({
  open,
  onOpenChange,
  workspaceId,
  productToEdit,
  onSuccess,
}: ProductFormDialogProps) {
  const isEditing = Boolean(productToEdit);

  // Basic Details
  const [title, setTitle] = useState(productToEdit?.title ?? "");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState(productToEdit?.tags?.join(", ") ?? "");
  const [status, setStatus] = useState<"draft" | "active">(
    productToEdit?.status === "archived" ? "draft" : (productToEdit?.status as "draft" | "active") ?? "active",
  );

  // Variant Configuration
  const [hasVariants, setHasVariants] = useState(false);
  const [optionName, setOptionName] = useState("Size");

  // Single Variant fields
  const [singlePrice, setSinglePrice] = useState(
    productToEdit ? String(paisaToPkr(productToEdit.priceRange.min.amountMinor)) : "",
  );
  const [singleCompareAt, setSingleCompareAt] = useState("");
  const [singleSku, setSingleSku] = useState("");
  const [singleStock, setSingleStock] = useState("10");
  const [singleTrackInventory, setSingleTrackInventory] = useState(true);
  const [singleLowStockThreshold, setSingleLowStockThreshold] = useState("5");

  // Multi-variant rows
  const [variants, setVariants] = useState<VariantRow[]>([
    {
      id: "v-1",
      name: "Small",
      price: "",
      compareAtPrice: "",
      sku: "",
      quantityOnHand: "10",
      trackInventory: true,
    },
    {
      id: "v-2",
      name: "Medium",
      price: "",
      compareAtPrice: "",
      sku: "",
      quantityOnHand: "10",
      trackInventory: true,
    },
    {
      id: "v-3",
      name: "Large",
      price: "",
      compareAtPrice: "",
      sku: "",
      quantityOnHand: "10",
      trackInventory: true,
    },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAddVariantRow = () => {
    setVariants((prev) => [
      ...prev,
      {
        id: `v-${Date.now()}`,
        name: "",
        price: singlePrice || "",
        compareAtPrice: "",
        sku: "",
        quantityOnHand: "10",
        trackInventory: true,
      },
    ]);
  };

  const handleRemoveVariantRow = (id: string) => {
    if (variants.length <= 1) {
      toast.error("At least one variant is required");
      return;
    }
    setVariants((prev) => prev.filter((v) => v.id !== id));
  };

  const handleUpdateVariant = (id: string, field: keyof VariantRow, value: string | boolean) => {
    setVariants((prev) =>
      prev.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!title.trim()) {
      setErrorMessage("Please enter a product title");
      return;
    }

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      setIsSubmitting(true);

      if (isEditing && productToEdit) {
        // Edit mode
        await updateProductApi(productToEdit.id, {
          title: title.trim(),
          description: description.trim() || undefined,
          status,
          tags,
        });
        toast.success("Product updated successfully");
        onSuccess();
        onOpenChange(false);
      } else {
        // Create mode
        let variantsPayload;

        if (hasVariants) {
          variantsPayload = variants.map((v, index) => {
            const priceVal = Number(v.price) || Number(singlePrice) || 0;
            if (priceVal <= 0) {
              throw new Error(`Variant "${v.name || `#${index + 1}`}" must have a valid price`);
            }
            const qty = v.trackInventory ? Number(v.quantityOnHand) || 0 : null;
            const threshold = v.trackInventory ? 5 : null;
            const invState = !v.trackInventory || qty === null
              ? ("untracked" as const)
              : qty <= 0
                ? ("out_of_stock" as const)
                : qty <= (threshold ?? 5)
                  ? ("low_stock" as const)
                  : ("in_stock" as const);

            return {
              title: v.name.trim() || `Variant ${index + 1}`,
              sku: v.sku.trim() || undefined,
              status: "active" as const,
              price: {
                amountMinor: pkrToPaisa(priceVal),
                currency: "PKR" as const,
              },
              compareAtPrice: v.compareAtPrice ? {
                amountMinor: pkrToPaisa(Number(v.compareAtPrice)),
                currency: "PKR" as const,
              } : undefined,
              optionValues: [
                {
                  optionName: optionName.trim() || "Option",
                  value: v.name.trim() || `Variant ${index + 1}`,
                },
              ],
              inventory: {
                trackInventory: v.trackInventory,
                quantityOnHand: qty,
                lowStockThreshold: threshold,
                state: invState,
              },
            };
          });
        } else {
          const priceVal = Number(singlePrice);
          if (!priceVal || priceVal <= 0) {
            throw new Error("Please enter a valid price in PKR");
          }

          const qty = singleTrackInventory ? Number(singleStock) || 0 : null;
          const threshold = singleTrackInventory ? Number(singleLowStockThreshold) || null : null;
          const invState = !singleTrackInventory || qty === null
            ? ("untracked" as const)
            : qty <= 0
              ? ("out_of_stock" as const)
              : threshold !== null && qty <= threshold
                ? ("low_stock" as const)
                : ("in_stock" as const);

          variantsPayload = [
            {
              title: "Default",
              sku: singleSku.trim() || undefined,
              status: "active" as const,
              price: {
                amountMinor: pkrToPaisa(priceVal),
                currency: "PKR" as const,
              },
              compareAtPrice: singleCompareAt ? {
                amountMinor: pkrToPaisa(Number(singleCompareAt)),
                currency: "PKR" as const,
              } : undefined,
              inventory: {
                trackInventory: singleTrackInventory,
                quantityOnHand: qty,
                lowStockThreshold: threshold,
                state: invState,
              },
            },
          ];
        }

        const payload: CreateProductInput = {
          workspaceId,
          title: title.trim(),
          description: description.trim() || undefined,
          status,
          tags,
          options: hasVariants
            ? [
                {
                  name: optionName.trim() || "Option",
                  values: variants.map((v) => v.name.trim()).filter(Boolean),
                  position: 0,
                },
              ]
            : [],
          variants: variantsPayload,
          images: [], // Images table arrives with separate task per API contract
        };

        await createProductApi(payload);
        toast.success("Product created in catalog!");
        onSuccess();
        onOpenChange(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save product";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Product" : "Add New Product"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update product details and tags for your central catalog."
              : "Add a product to your catalog. It will be available for sale and ready to sync with your stores."}
          </DialogDescription>
        </DialogHeader>

        {errorMessage ? (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-destructive text-sm">
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          {/* Section 1: Basic Information */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="product-title" className="text-sm font-medium">
                Product Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="product-title"
                placeholder="e.g. Lawn Embroidered 3-Piece Suit"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="product-desc" className="text-sm font-medium">
                Description (Optional)
              </Label>
              <Textarea
                id="product-desc"
                placeholder="Enter fabric details, cut, washing instructions, or product description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="product-tags" className="text-sm font-medium">
                  Tags (Comma separated)
                </Label>
                <Input
                  id="product-tags"
                  placeholder="e.g. Summer, Lawn, Unstitched"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="product-status" className="text-sm font-medium">
                  Publication Status
                </Label>
                <Select value={status} onValueChange={(val: "draft" | "active") => setStatus(val)}>
                  <SelectTrigger id="product-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Live (Active)</SelectItem>
                    <SelectItem value="draft">Draft (Hidden)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Section 2: Pricing & Variants (Only in Create Mode) */}
          {!isEditing ? (
            <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-sm">Product Variants</h4>
                  <p className="text-xs text-muted-foreground">
                    Does this product have multiple sizes, colors, or options?
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{hasVariants ? "Multiple Variants" : "Single SKU"}</span>
                  <Switch
                    checked={hasVariants}
                    onCheckedChange={(checked) => setHasVariants(checked)}
                  />
                </div>
              </div>

              {/* Simple Mode (Single Variant) */}
              {!hasVariants ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="single-price" className="text-xs font-medium">
                      Selling Price (PKR) <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Rs.</span>
                      <Input
                        id="single-price"
                        type="number"
                        min="0"
                        step="1"
                        placeholder="2500"
                        className="pl-9"
                        value={singlePrice}
                        onChange={(e) => setSinglePrice(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="single-compare" className="text-xs font-medium">
                      Original Price (Optional)
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Rs.</span>
                      <Input
                        id="single-compare"
                        type="number"
                        min="0"
                        step="1"
                        placeholder="3000"
                        className="pl-9"
                        value={singleCompareAt}
                        onChange={(e) => setSingleCompareAt(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="single-sku" className="text-xs font-medium">
                      SKU / Code
                    </Label>
                    <Input
                      id="single-sku"
                      placeholder="e.g. KRT-001"
                      value={singleSku}
                      onChange={(e) => setSingleSku(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="single-stock" className="text-xs font-medium">
                        Initial Stock on Hand
                      </Label>
                      <div className="flex items-center gap-1.5">
                        <Label htmlFor="track-toggle" className="text-[11px] text-muted-foreground">
                          Track inventory
                        </Label>
                        <Switch
                          id="track-toggle"
                          size="sm"
                          checked={singleTrackInventory}
                          onCheckedChange={setSingleTrackInventory}
                        />
                      </div>
                    </div>
                    <Input
                      id="single-stock"
                      type="number"
                      min="0"
                      disabled={!singleTrackInventory}
                      placeholder="Units in warehouse"
                      value={singleStock}
                      onChange={(e) => setSingleStock(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="single-low-threshold" className="text-xs font-medium">
                      Low Stock Alert
                    </Label>
                    <Input
                      id="single-low-threshold"
                      type="number"
                      min="1"
                      disabled={!singleTrackInventory}
                      placeholder="e.g. 5"
                      value={singleLowStockThreshold}
                      onChange={(e) => setSingleLowStockThreshold(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                /* Multi-Variant Builder */
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-3">
                    <Label htmlFor="opt-name" className="text-xs font-medium shrink-0">
                      Option Type:
                    </Label>
                    <Input
                      id="opt-name"
                      placeholder="e.g. Size or Color"
                      value={optionName}
                      onChange={(e) => setOptionName(e.target.value)}
                      className="max-w-[180px] h-8 text-xs"
                    />
                  </div>

                  <div className="space-y-2">
                    {variants.map((v, idx) => (
                      <div
                        key={v.id}
                        className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2.5"
                      >
                        <div className="flex-1 min-w-[100px]">
                          <Label className="text-[11px] text-muted-foreground">{optionName || "Variant"} Value</Label>
                          <Input
                            placeholder="e.g. Small"
                            value={v.name}
                            onChange={(e) => handleUpdateVariant(v.id, "name", e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>

                        <div className="w-[110px]">
                          <Label className="text-[11px] text-muted-foreground">Price (PKR)</Label>
                          <Input
                            type="number"
                            min="0"
                            placeholder="2500"
                            value={v.price}
                            onChange={(e) => handleUpdateVariant(v.id, "price", e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>

                        <div className="w-[110px]">
                          <Label className="text-[11px] text-muted-foreground">SKU</Label>
                          <Input
                            placeholder={`SKU-${idx + 1}`}
                            value={v.sku}
                            onChange={(e) => handleUpdateVariant(v.id, "sku", e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>

                        <div className="w-[80px]">
                          <Label className="text-[11px] text-muted-foreground">Stock</Label>
                          <Input
                            type="number"
                            min="0"
                            value={v.quantityOnHand}
                            onChange={(e) => handleUpdateVariant(v.id, "quantityOnHand", e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveVariantRow(v.id)}
                          className="size-8 self-end text-muted-foreground hover:text-destructive"
                          title="Remove Variant"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddVariantRow}
                    className="text-xs w-full"
                  >
                    <Plus className="size-3.5 mr-1" />
                    Add Another {optionName || "Variant"}
                  </Button>
                </div>
              )}
            </div>
          ) : null}

          {/* Multi-Store Sync Readiness Callout */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-start gap-2.5 text-xs text-primary-foreground/90">
            <Sparkles className="size-4 text-primary shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-foreground">Central Multi-Store Catalog: </span>
              <span className="text-muted-foreground">
                This item is stored in your central ledger. Once connected in Settings, this product and its variants will automatically sync to your Shopify, WooCommerce, and WhatsApp Sales channels.
              </span>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : isEditing ? (
                "Save Changes"
              ) : (
                "Create Product"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
