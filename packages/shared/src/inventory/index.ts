import { z } from "zod";

import { inventoryStateSchema, inventoryStateValues } from "../products/index.js";

export { inventoryStateSchema, inventoryStateValues };

export const stockMovementReasonValues = [
  "purchase",
  "sale",
  "return",
  "manual_adjustment",
  "correction",
  "damage_loss",
] as const;

export const inventoryContractVersion = "2026-08-23";

const idSchema = z.uuid();
const trimmedText = z.string().trim();
const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const stockMovementReasonSchema = z.enum(stockMovementReasonValues);

/**
 * The unrefined object shape.
 *
 * Zod 4 refuses `.pick()` / `.omit()` on a schema carrying refinements, so the
 * refinement is applied to derived schemas rather than baked into the base.
 * Keep this internal — `inventorySchema` is the public contract.
 */
const inventoryBaseSchema = z.object({
  id: idSchema,
  variantId: idSchema,
  productId: idSchema,
  sellerId: idSchema,
  workspaceId: idSchema,
  trackInventory: z.boolean(),
  quantityOnHand: z.int().nonnegative(),
  reservedQuantity: z.int().nonnegative(),
  lowStockThreshold: z.int().nonnegative().nullable(),
  state: inventoryStateSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const inventorySchema = inventoryBaseSchema.superRefine(
  (inventory, context) => {
    if (inventory.reservedQuantity > inventory.quantityOnHand) {
      context.addIssue({
        code: "custom",
        path: ["reservedQuantity"],
        message: "Reserved quantity cannot exceed quantity on hand.",
      });
    }
  },
);

/**
 * Append-only audit record for a single stock change. Movement records are
 * never edited or deleted; history must stay reconstructible in order.
 */
const stockMovementBaseSchema = z.object({
  id: idSchema,
  variantId: idSchema,
  productId: idSchema,
  sellerId: idSchema,
  workspaceId: idSchema,
  reason: stockMovementReasonSchema,
  quantityDelta: z.int(),
  beforeQuantityOnHand: z.int().nonnegative(),
  afterQuantityOnHand: z.int().nonnegative(),
  performedBy: idSchema,
  note: trimmedText.max(500).nullable(),
  createdAt: isoDateTimeSchema,
});

export const stockMovementSchema = stockMovementBaseSchema.superRefine(
  (movement, context) => {
    if (
      movement.afterQuantityOnHand !==
      movement.beforeQuantityOnHand + movement.quantityDelta
    ) {
      context.addIssue({
        code: "custom",
        path: ["afterQuantityOnHand"],
        message:
          "After quantity must equal before quantity plus the delta.",
      });
    }

    if (movement.quantityDelta === 0) {
      context.addIssue({
        code: "custom",
        path: ["quantityDelta"],
        message: "A stock movement must change the quantity on hand.",
      });
    }
  },
);

export type StockMovement = z.infer<typeof stockMovementSchema>;

export const inventorySortValues = [
  "updated_desc",
  "updated_asc",
  "on_hand_desc",
  "on_hand_asc",
] as const;

export const inventorySortSchema = z.enum(inventorySortValues);

/**
 * Seller-facing stock adjustment. The caller states the new on-hand total,
 * matching the adjustment dialog's before/after preview and the copilot
 * update-stock tool's set semantics. The backend derives the movement delta
 * from current state; a target below zero is rejected here so invalid
 * adjustments never reach the service layer.
 */
export const adjustStockInputSchema = z.object({
  workspaceId: idSchema,
  variantId: idSchema,
  targetQuantityOnHand: z.int().nonnegative(),
  reason: stockMovementReasonSchema,
  note: trimmedText.max(500).nullable().optional(),
});

export const inventorySearchQuerySchema = z.object({
  workspaceId: idSchema,
  query: trimmedText.min(1).max(120).optional(),
  states: z
    .array(inventoryStateSchema)
    .max(inventoryStateValues.length)
    .optional(),
  lowStockOnly: z.boolean().default(false),
  sort: inventorySortSchema.default("updated_desc"),
  limit: z.int().min(1).max(100).default(25),
  cursor: trimmedText.min(1).max(500).optional(),
});

export const stockMovementSearchQuerySchema = z.object({
  workspaceId: idSchema,
  variantId: idSchema.optional(),
  reasons: z
    .array(stockMovementReasonSchema)
    .max(stockMovementReasonValues.length)
    .optional(),
  limit: z.int().min(1).max(100).default(25),
  cursor: trimmedText.min(1).max(500).optional(),
});

export const inventoryListItemSchema = inventoryBaseSchema.pick({
  id: true,
  variantId: true,
  productId: true,
  quantityOnHand: true,
  reservedQuantity: true,
  lowStockThreshold: true,
  state: true,
  updatedAt: true,
}).extend({
  availableQuantity: z.int().nonnegative(),
});

export type InventorySort = z.infer<typeof inventorySortSchema>;
export type AdjustStockInput = z.input<typeof adjustStockInputSchema>;
export type ParsedAdjustStockInput = z.output<typeof adjustStockInputSchema>;
export type InventorySearchQuery = z.input<typeof inventorySearchQuerySchema>;
export type ParsedInventorySearchQuery = z.output<
  typeof inventorySearchQuerySchema
>;
export type StockMovementSearchQuery = z.input<
  typeof stockMovementSearchQuerySchema
>;
export type ParsedStockMovementSearchQuery = z.output<
  typeof stockMovementSearchQuerySchema
>;

export type StockMovementReason = z.infer<typeof stockMovementReasonSchema>;
export type Inventory = z.infer<typeof inventorySchema>;
