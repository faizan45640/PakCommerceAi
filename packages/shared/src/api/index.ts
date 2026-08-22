import { z } from "zod";

export const apiContractVersion = "2026-08-22";

export const apiErrorCodeValues = [
  "validation_error",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "internal_error",
] as const;

export const apiErrorCodeSchema = z.enum(apiErrorCodeValues);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorDetailsSchema = z.record(z.string(), z.array(z.string()));

export type ApiErrorDetails = z.infer<typeof apiErrorDetailsSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string().min(1),
    details: apiErrorDetailsSchema.optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const apiMetaSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
});

export type ApiMeta = z.infer<typeof apiMetaSchema>;

export function apiDataResponseSchema<TSchema extends z.ZodType>(dataSchema: TSchema) {
  return z.object({
    data: dataSchema,
  });
}

export function apiListResponseSchema<TSchema extends z.ZodType>(itemSchema: TSchema) {
  return z.object({
    data: z.array(itemSchema),
    meta: apiMetaSchema,
  });
}

export type ApiDataResponse<TData> = { data: TData };

export type ApiListResponse<TItem> = { data: TItem[]; meta: ApiMeta };
