import { z } from "zod";

export const productStatusValues = ["draft", "active", "archived"] as const;
export const productVariantStatusValues = ["active", "inactive"] as const;
export const inventoryStateValues = [
  "in_stock",
  "low_stock",
  "out_of_stock",
  "untracked",
] as const;
export const productSortValues = [
  "newest",
  "updated_desc",
  "title_asc",
  "title_desc",
  "price_asc",
  "price_desc",
  "stock_asc",
  "stock_desc",
] as const;
export const productSearchFieldValues = [
  "title",
  "slug",
  "description",
  "sku",
  "barcode",
  "tags",
  "variant_title",
  "variant_options",
] as const;

export const productContractVersion = "2026-07-12";

const idSchema = z.uuid();
const trimmedText = z.string().trim();
const nullableText = trimmedText.nullable();
const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const productStatusSchema = z.enum(productStatusValues);
export const productVariantStatusSchema = z.enum(productVariantStatusValues);
export const inventoryStateSchema = z.enum(inventoryStateValues);
export const productSortSchema = z.enum(productSortValues);
export const productSearchFieldSchema = z.enum(productSearchFieldValues);

export const currencyCodeSchema = z.literal("PKR");

export const moneySchema = z.object({
  amountMinor: z.int().nonnegative(),
  currency: currencyCodeSchema.default("PKR"),
});

export const productOptionSchema = z.object({
  id: idSchema.optional(),
  name: trimmedText.min(1).max(60),
  values: z.array(trimmedText.min(1).max(80)).min(1).max(50),
  position: z.int().nonnegative(),
});

export const productVariantOptionValueSchema = z.object({
  optionName: trimmedText.min(1).max(60),
  value: trimmedText.min(1).max(80),
});

export const productVariantSchema = z.object({
  id: idSchema,
  productId: idSchema,
  title: trimmedText.min(1).max(160),
  sku: nullableText.optional(),
  barcode: nullableText.optional(),
  status: productVariantStatusSchema,
  price: moneySchema,
  compareAtPrice: moneySchema.nullable().optional(),
  optionValues: z.array(productVariantOptionValueSchema).max(3),
  inventory: z.object({
    trackInventory: z.boolean(),
    quantityOnHand: z.int().nonnegative().nullable(),
    lowStockThreshold: z.int().nonnegative().nullable(),
    state: inventoryStateSchema,
  }),
  position: z.int().nonnegative(),
  imageId: idSchema.nullable().optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const productImageSchema = z.object({
  id: idSchema,
  productId: idSchema,
  url: z.string().url(),
  altText: trimmedText.max(160).nullable(),
  position: z.int().nonnegative(),
  isPrimary: z.boolean(),
  source: z
    .object({
      provider: trimmedText.min(1).max(60),
      externalId: trimmedText.min(1).max(160).nullable().optional(),
    })
    .nullable()
    .optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const productSchema = z
  .object({
    id: idSchema,
    sellerId: idSchema,
    workspaceId: idSchema,
    title: trimmedText.min(1).max(180),
    slug: trimmedText.min(3).max(220),
    description: nullableText.optional(),
    status: productStatusSchema,
    tags: z.array(trimmedText.min(1).max(60)).max(30),
    categoryIds: z.array(idSchema).max(10),
    options: z.array(productOptionSchema).max(3),
    variants: z.array(productVariantSchema).min(1).max(250),
    images: z.array(productImageSchema).max(20),
    searchText: trimmedText.max(2000),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    archivedAt: isoDateTimeSchema.nullable(),
  })
  .superRefine((product, context) => {
    const primaryImages = product.images.filter((image) => image.isPrimary);

    if (primaryImages.length > 1) {
      context.addIssue({
        code: "custom",
        path: ["images"],
        message: "Only one product image can be marked as primary.",
      });
    }
  });

export const createProductImageInputSchema = productImageSchema
  .pick({
    url: true,
    altText: true,
    position: true,
    isPrimary: true,
    source: true,
  })
  .partial({
    position: true,
    isPrimary: true,
    source: true,
  });

export const createProductVariantInputSchema = productVariantSchema
  .pick({
    title: true,
    sku: true,
    barcode: true,
    status: true,
    price: true,
    compareAtPrice: true,
    optionValues: true,
    inventory: true,
    position: true,
    imageId: true,
  })
  .partial({
    sku: true,
    barcode: true,
    status: true,
    compareAtPrice: true,
    optionValues: true,
    inventory: true,
    position: true,
    imageId: true,
  });

export const createProductInputSchema = z
  .object({
    workspaceId: idSchema,
    title: trimmedText.min(1).max(180),
    slug: trimmedText.min(3).max(220).optional(),
    description: nullableText.optional(),
    status: productStatusSchema.default("draft"),
    tags: z.array(trimmedText.min(1).max(60)).max(30).default([]),
    categoryIds: z.array(idSchema).max(10).default([]),
    options: z.array(productOptionSchema).max(3).default([]),
    variants: z.array(createProductVariantInputSchema).min(1).max(250),
    images: z.array(createProductImageInputSchema).max(20).default([]),
  })
  .superRefine((product, context) => {
    const primaryImages = product.images.filter((image) => image.isPrimary);

    if (primaryImages.length > 1) {
      context.addIssue({
        code: "custom",
        path: ["images"],
        message: "Only one product image can be marked as primary.",
      });
    }
  });

export const updateProductInputSchema = z.object({
  title: trimmedText.min(1).max(180).optional(),
  slug: trimmedText.min(3).max(220).optional(),
  description: nullableText.optional(),
  status: productStatusSchema.optional(),
  tags: z.array(trimmedText.min(1).max(60)).max(30).optional(),
  categoryIds: z.array(idSchema).max(10).optional(),
  options: z.array(productOptionSchema).max(3).optional(),
});

export const upsertProductVariantInputSchema =
  createProductVariantInputSchema.extend({
    id: idSchema.optional(),
  });

export const upsertProductImageInputSchema = createProductImageInputSchema.extend({
  id: idSchema.optional(),
});

export const productSearchQuerySchema = z.object({
  workspaceId: idSchema,
  query: trimmedText.min(1).max(120).optional(),
  statuses: z.array(productStatusSchema).max(productStatusValues.length).optional(),
  inventoryStates: z
    .array(inventoryStateSchema)
    .max(inventoryStateValues.length)
    .optional(),
  categoryIds: z.array(idSchema).max(10).optional(),
  tags: z.array(trimmedText.min(1).max(60)).max(20).optional(),
  searchFields: z.array(productSearchFieldSchema).optional(),
  sort: productSortSchema.default("updated_desc"),
  limit: z.int().min(1).max(100).default(25),
  cursor: trimmedText.min(1).max(500).optional(),
});

export const productListItemSchema = productSchema.pick({
  id: true,
  sellerId: true,
  workspaceId: true,
  title: true,
  slug: true,
  status: true,
  tags: true,
  categoryIds: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
}).extend({
  primaryImage: productImageSchema.nullable(),
  variantCount: z.int().nonnegative(),
  priceRange: z.object({
    min: moneySchema,
    max: moneySchema,
  }),
  inventoryState: inventoryStateSchema,
});

export type ProductStatus = z.infer<typeof productStatusSchema>;
export type ProductVariantStatus = z.infer<typeof productVariantStatusSchema>;
export type InventoryState = z.infer<typeof inventoryStateSchema>;
export type ProductSort = z.infer<typeof productSortSchema>;
export type ProductSearchField = z.infer<typeof productSearchFieldSchema>;
export type Money = z.infer<typeof moneySchema>;
export type ProductOption = z.infer<typeof productOptionSchema>;
export type ProductVariantOptionValue = z.infer<
  typeof productVariantOptionValueSchema
>;
export type ProductVariant = z.infer<typeof productVariantSchema>;
export type ProductImage = z.infer<typeof productImageSchema>;
export type Product = z.infer<typeof productSchema>;
export type CreateProductImageInput = z.input<
  typeof createProductImageInputSchema
>;
export type CreateProductVariantInput = z.input<
  typeof createProductVariantInputSchema
>;
export type CreateProductInput = z.input<typeof createProductInputSchema>;
export type ParsedCreateProductInput = z.output<typeof createProductInputSchema>;
export type UpdateProductInput = z.input<typeof updateProductInputSchema>;
export type UpsertProductVariantInput = z.input<
  typeof upsertProductVariantInputSchema
>;
export type UpsertProductImageInput = z.input<
  typeof upsertProductImageInputSchema
>;
export type ProductSearchQuery = z.input<typeof productSearchQuerySchema>;
export type ParsedProductSearchQuery = z.output<typeof productSearchQuerySchema>;
export type ProductListItem = z.infer<typeof productListItemSchema>;
