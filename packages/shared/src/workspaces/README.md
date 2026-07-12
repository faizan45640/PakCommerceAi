# Workspace Contract

The workspace contract mirrors the current Supabase `public.workspaces` schema
while keeping application code independent from database column naming.

## Supabase Mapping

| Contract field | Supabase column |
|---|---|
| `id` | `workspaces.id` |
| `sellerId` | `workspaces.seller_id` |
| `name` | `workspaces.name` |
| `slug` | `workspaces.slug` |
| `status` | `workspaces.status` |
| `isDefault` | `workspaces.is_default` |
| `createdAt` | `workspaces.created_at` |
| `updatedAt` | `workspaces.updated_at` |
| `archivedAt` | `workspaces.archived_at` |

The allowed workspace statuses are `active` and `archived`.

## Backend Usage

The API validates request bodies with shared schemas, derives `sellerId` from the
authenticated user, and maps camelCase contract fields to snake_case database
columns.

```ts
import { createWorkspaceInputSchema } from "@pakcommerce/shared/workspaces";

const input = createWorkspaceInputSchema.parse(req.body);
```

## Frontend Usage

The frontend imports inferred types for UI state and form payloads, and may also
reuse schemas for client-side validation.

```ts
import type { Workspace, CreateWorkspaceInput } from "@pakcommerce/shared";
import { createWorkspaceInputSchema } from "@pakcommerce/shared/workspaces";
```

The frontend should never send `sellerId`; the backend owns seller resolution.
