import { z } from "zod";

export const workspaceStatusValues = ["active", "archived"] as const;
export const workspaceContractVersion = "2026-07-12";

const idSchema = z.uuid();
const trimmedText = z.string().trim();
const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const workspaceStatusSchema = z.enum(workspaceStatusValues);

/**
 * The unrefined object shape.
 *
 * Zod 4 refuses `.pick()` / `.omit()` on a schema carrying refinements, so the
 * refinement is applied to derived schemas rather than baked into the base.
 * Keep this internal — `workspaceSchema` is the public contract.
 */
const workspaceBaseSchema = z.object({
  id: idSchema,
  sellerId: idSchema,
  name: trimmedText.min(2).max(120),
  slug: trimmedText.min(3).max(80),
  status: workspaceStatusSchema,
  isDefault: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  archivedAt: isoDateTimeSchema.nullable(),
});

export const workspaceSchema = workspaceBaseSchema.superRefine(
  (workspace, context) => {
    if (workspace.status === "archived" && workspace.archivedAt === null) {
      context.addIssue({
        code: "custom",
        path: ["archivedAt"],
        message: "Archived workspaces must include archivedAt.",
      });
    }

    if (workspace.status === "active" && workspace.archivedAt !== null) {
      context.addIssue({
        code: "custom",
        path: ["archivedAt"],
        message: "Active workspaces cannot include archivedAt.",
      });
    }
  },
);

export const createWorkspaceInputSchema = z.object({
  name: trimmedText.min(2).max(120),
  slug: trimmedText.min(3).max(80).optional(),
  isDefault: z.boolean().default(false),
});

export const updateWorkspaceInputSchema = z.object({
  name: trimmedText.min(2).max(120).optional(),
  slug: trimmedText.min(3).max(80).optional(),
  status: workspaceStatusSchema.optional(),
  isDefault: z.boolean().optional(),
});

export const workspaceListItemSchema = workspaceBaseSchema.pick({
  id: true,
  sellerId: true,
  name: true,
  slug: true,
  status: true,
  isDefault: true,
  updatedAt: true,
});

export type WorkspaceStatus = z.infer<typeof workspaceStatusSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type CreateWorkspaceInput = z.input<typeof createWorkspaceInputSchema>;
export type ParsedCreateWorkspaceInput = z.output<
  typeof createWorkspaceInputSchema
>;
export type UpdateWorkspaceInput = z.input<typeof updateWorkspaceInputSchema>;
export type WorkspaceListItem = z.infer<typeof workspaceListItemSchema>;
