# Supabase Setup

This project uses Supabase from both the Next.js frontend and the Express API.

## Environment Variables

Copy `.env.example` to `.env` and fill these values:

```bash
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

`NEXT_PUBLIC_*` values are exposed to the browser, so only use the Supabase publishable key there. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.

`SUPABASE_ANON_KEY` is still accepted by the backend integration package for compatibility, but new setup should use `SUPABASE_PUBLISHABLE_KEY`.

## Frontend

Use these helpers in `apps/web`:

- `apps/web/lib/supabase/client.ts` for Client Components.
- `apps/web/lib/supabase/server.ts` for Server Components, Server Actions, and Route Handlers.
- `apps/web/proxy.ts` keeps Supabase SSR cookies in sync.

Example Client Component:

```ts
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();
```

Example Server Component or Route Handler:

```ts
import { createClient } from "@/lib/supabase/server";

const supabase = await createClient();
```

## Backend API

Use `apps/api/src/lib/supabase.ts` when API code needs Supabase:

```ts
import {
  createApiSupabaseAdminClient,
  createApiSupabaseClient,
} from "./lib/supabase.js";
```

`createApiSupabaseClient()` uses the publishable key and has no persisted session.

`createApiSupabaseAdminClient()` uses `SUPABASE_SERVICE_ROLE_KEY`. Only use it in trusted backend code where bypassing RLS is intentional.

Generated Supabase database types live in `packages/integrations/src/supabase/database.types.ts`.

When the database schema changes, regenerate the Supabase types so frontend and backend stay aligned with the real schema.
