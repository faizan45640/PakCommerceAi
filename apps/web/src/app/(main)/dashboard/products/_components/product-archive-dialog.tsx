"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ProductListItem } from "@pakcommerce/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { archiveProductApi } from "@/lib/api/products";

interface ProductArchiveDialogProps {
  product: ProductListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ProductArchiveDialog({
  product,
  open,
  onOpenChange,
  onSuccess,
}: ProductArchiveDialogProps) {
  const [isArchiving, setIsArchiving] = useState(false);

  if (!product) return null;

  const handleArchive = async () => {
    try {
      setIsArchiving(true);
      await archiveProductApi(product.id);
      toast.success(`Archived "${product.title}"`);
      onSuccess();
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to archive product";
      toast.error(msg);
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5 shrink-0" />
            <DialogTitle>Archive Product</DialogTitle>
          </div>
          <DialogDescription className="pt-2 text-sm">
            Are you sure you want to archive <strong>{product.title}</strong>?
          </DialogDescription>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Archiving hides this product from active sales channels and stock reports. Historical orders, transactions, and audit logs associated with this product remain safely preserved.
        </p>

        <DialogFooter className="pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isArchiving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleArchive}
            disabled={isArchiving}
          >
            {isArchiving ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Archiving...
              </>
            ) : (
              "Confirm Archive"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
