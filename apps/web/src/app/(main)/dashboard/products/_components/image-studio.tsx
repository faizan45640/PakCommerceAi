"use client";

import { useRef, useState } from "react";
import {
  Camera,
  Link as LinkIcon,
  Plus,
  Sparkles,
  Star,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface StudioImage {
  id?: string;
  url: string;
  altText?: string | null;
  isPrimary: boolean;
}

interface ImageStudioProps {
  images: StudioImage[];
  onChange: (images: StudioImage[]) => void;
}

const SAMPLE_IMAGES = [
  {
    name: "Classic Navy Kurta",
    url: "https://images.unsplash.com/photo-1597983073493-88cd35cf93b0?auto=format&fit=crop&w=800&q=80",
  },
  {
    name: "Lawn Fabric Detail",
    url: "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=800&q=80",
  },
  {
    name: "Embroidered Collar",
    url: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=800&q=80",
  },
  {
    name: "Peshawari Leather Chappal",
    url: "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=800&q=80",
  },
];

export function ImageStudio({ images, onChange }: ImageStudioProps) {
  const [urlInput, setUrlInput] = useState("");
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const primaryImage = images.find((img) => img.isPrimary) || images[0];
  const galleryImages = images.filter((img) => img !== primaryImage);

  function handleAddImageUrl(url: string, makePrimary = false) {
    const trimmed = url.trim();
    if (!trimmed) return;

    try {
      new URL(trimmed);
    } catch {
      toast.error("Please enter a valid image URL starting with http:// or https://");
      return;
    }

    if (images.some((img) => img.url === trimmed)) {
      toast.info("This image has already been added.");
      return;
    }

    const shouldBePrimary = images.length === 0 || makePrimary;

    const updated = images.map((img) => ({
      ...img,
      isPrimary: shouldBePrimary ? false : img.isPrimary,
    }));

    onChange([
      ...updated,
      {
        url: trimmed,
        altText: null,
        isPrimary: shouldBePrimary,
      },
    ]);

    setUrlInput("");
    setIsUrlModalOpen(false);
    toast.success(shouldBePrimary ? "Main cover image set!" : "Gallery photo added!");
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    toast.info(
      "Direct device upload requires cloud storage configuration. Please paste an image URL or choose from sample images.",
      { duration: 5000 },
    );

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleSetAsPrimary(targetUrl: string) {
    const updated = images.map((img) => ({
      ...img,
      isPrimary: img.url === targetUrl,
    }));
    onChange(updated);
    toast.success("Updated main cover photo!");
  }

  function handleRemoveImage(targetUrl: string) {
    const filtered = images.filter((img) => img.url !== targetUrl);
    // If the removed image was primary, make the first remaining image primary
    if (filtered.length > 0 && !filtered.some((img) => img.isPrimary)) {
      filtered[0].isPrimary = true;
    }
    onChange(filtered);
    toast.success("Image removed.");
  }

  return (
    <Card className="border-border/70 shadow-2xs overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Camera className="size-4 text-primary" />
              Product Photos (Main & Gallery)
            </CardTitle>
            <CardDescription className="text-xs">
              Add your primary cover photo and additional angles to boost customer trust.
            </CardDescription>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
            {images.length}/20 Photos
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Hidden native file input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept="image/*"
          multiple
          className="hidden"
        />

        {images.length === 0 ? (
          /* Empty State: Big clean dropzone */
          <div className="rounded-xl border-2 border-dashed border-border/80 bg-muted/20 p-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/30">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
              <UploadCloud className="size-6" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">Upload Product Pictures</h4>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Drag & drop photos, select from device, or paste image URLs. First photo becomes the main store cover.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
              <Button
                type="button"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs gap-1.5 bg-primary text-primary-foreground font-semibold"
              >
                <UploadCloud className="size-3.5" />
                Select from Device
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsUrlModalOpen(true)}
                className="text-xs gap-1.5"
              >
                <LinkIcon className="size-3.5" />
                Paste Image Link
              </Button>
            </div>

            {/* Quick Sample Photos */}
            <div className="mt-5 pt-4 border-t border-border/40">
              <span className="text-[11px] text-muted-foreground block mb-2 font-medium">
                Testing? Click to load sample Pakistani product photos:
              </span>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {SAMPLE_IMAGES.map((sample) => (
                  <button
                    key={sample.name}
                    type="button"
                    onClick={() => handleAddImageUrl(sample.url)}
                    className="inline-flex items-center gap-1 text-[11px] rounded-full border bg-background px-2.5 py-0.5 text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
                  >
                    <Sparkles className="size-2.5 text-amber-500" />
                    {sample.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Active State: Main Cover + Gallery Grid */
          <div className="space-y-4">
            {/* 1. Main Cover Image (Hero) */}
            {primaryImage && (
              <div>
                <Label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Main / Cover Photo (Shown on Store Catalog & WhatsApp)
                </Label>
                <div className="relative group rounded-xl border-2 border-emerald-600/40 bg-zinc-950 overflow-hidden max-h-72 flex items-center justify-center shadow-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={primaryImage.url}
                    alt={primaryImage.altText || "Main product cover"}
                    className="w-full h-64 object-contain"
                  />
                  {/* Primary Badge */}
                  <div className="absolute top-3 left-3 flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow-md">
                    <Star className="size-3 fill-current" />
                    <span>Main Cover Image</span>
                  </div>

                  {/* Hover Actions */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs gap-1"
                    >
                      <UploadCloud className="size-3.5" />
                      Replace
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemoveImage(primaryImage.url)}
                      className="text-xs gap-1"
                    >
                      <Trash2 className="size-3.5" />
                      Remove
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* 2. Additional Gallery Photos */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Additional Photos ({galleryImages.length})
                </Label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
                  >
                    <Plus className="size-3" />
                    Add Device Photo
                  </button>
                  <span className="text-muted-foreground text-xs">•</span>
                  <button
                    type="button"
                    onClick={() => setIsUrlModalOpen(true)}
                    className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
                  >
                    <LinkIcon className="size-3" />
                    Add via Link
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                {galleryImages.map((img, idx) => (
                  <div
                    key={img.url}
                    className="relative group rounded-lg border bg-zinc-900 overflow-hidden aspect-square flex items-center justify-center shadow-2xs"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.altText || `Gallery image ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />

                    {/* Quick Hover Actions Overlay */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-1">
                      <button
                        type="button"
                        onClick={() => handleSetAsPrimary(img.url)}
                        className="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2 py-0.5 rounded shadow-xs flex items-center gap-1"
                      >
                        <Star className="size-2.5 fill-current" />
                        Set Main
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(img.url)}
                        className="text-[10px] bg-red-600/80 hover:bg-red-600 text-white font-medium px-2 py-0.5 rounded flex items-center gap-1"
                      >
                        <Trash2 className="size-2.5" />
                        Remove
                      </button>
                    </div>
                  </div>
                ))}

                {/* + Add Photo Tile */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg border-2 border-dashed border-border/80 hover:border-primary/60 bg-muted/20 hover:bg-muted/40 aspect-square flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="size-5" />
                  <span className="text-[10px] font-semibold">Add Photo</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal / Popover to paste direct URL */}
        {isUrlModalOpen && (
          <div className="rounded-lg border border-primary/30 bg-background p-3 space-y-2 mt-2 shadow-xs">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <LinkIcon className="size-3.5 text-primary" />
                Add Image via URL
              </Label>
              <button
                type="button"
                onClick={() => setIsUrlModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="https://example.com/product-image.jpg"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddImageUrl(urlInput);
                  }
                }}
                className="h-8 text-xs font-mono"
                autoFocus
              />
              <Button
                type="button"
                size="sm"
                onClick={() => handleAddImageUrl(urlInput)}
                className="h-8 text-xs px-3"
              >
                Add
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Works with image URLs from Imgur, Cloudinary, Shopify, or WhatsApp media links.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
