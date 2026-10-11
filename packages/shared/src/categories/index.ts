import { z } from "zod";

const idSchema = z.string().uuid();
const trimmedText = z.string().trim();
const nullableText = trimmedText.nullable();
const isoDateTimeSchema = z.string().datetime({ offset: true });

export const channelMappingsSchema = z.record(z.string(), z.unknown()).default({});

export const categorySchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  sellerId: idSchema,
  parentId: idSchema.nullable(),
  name: trimmedText.min(1, "Category name is required").max(120),
  slug: trimmedText.min(1).max(150),
  description: nullableText.optional(),
  channelMappings: channelMappingsSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type Category = z.infer<typeof categorySchema>;

export const createCategorySchema = z.object({
  name: trimmedText.min(1, "Category name is required").max(120),
  slug: trimmedText.min(1).max(150).optional(),
  parentId: idSchema.nullable().optional(),
  description: trimmedText.max(500).nullable().optional(),
  channelMappings: z.record(z.string(), z.unknown()).optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  name: trimmedText.min(1).max(120).optional(),
  slug: trimmedText.min(1).max(150).optional(),
  parentId: idSchema.nullable().optional(),
  description: trimmedText.max(500).nullable().optional(),
  channelMappings: z.record(z.string(), z.unknown()).optional(),
});

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export interface CategoryWithChildren extends Category {
  children?: CategoryWithChildren[];
}
