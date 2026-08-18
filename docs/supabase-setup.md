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

- `apps/web/src/lib/supabase/client.ts` for Client Components.
- `apps/web/src/lib/supabase/server.ts` for Server Components, Server Actions, and Route Handlers.
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

---

## Migrations

The database schema lives in `supabase/migrations/`. It is the source of truth — not the
Supabase dashboard.

Before T-020 the schema existed only in the hosted project, created by hand. Nobody could
clone the repository and recreate it. That is now fixed for everything added from here on.

### Running the database locally

Needs Docker running.

```bash
npx supabase start      # first run pulls several GB of images
npx supabase status     # URLs, keys, and the Postgres port
npx supabase stop       # when you are done
```

`supabase start` applies every migration in order. Local Studio runs at
<http://127.0.0.1:54323> and Postgres at `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

### If `supabase start` fails or Studio will not load

The usual symptom is `http://127.0.0.1:54323` refusing to load, or:

```text
LegacyHealthCheckTimeoutError:
  supabase_analytics_... container is not ready: unhealthy
  supabase_realtime_...  container is not ready: unhealthy
  supabase_storage_...   container is not ready: unhealthy
  supabase_studio_...    container is not ready: unhealthy
```

`analytics` (logflare) frequently fails its health check on Windows, and when it does the CLI
tears the whole stack down with it — often leaving only the database container running. That
is confusing, because the database alone is enough for the tests to pass, so everything looks
fine until you try to open Studio.

Start without the services this project does not use:

```bash
npx supabase stop
npx supabase start -x logflare,vector,realtime,storage-api,imgproxy,edge-runtime,supavisor,mailpit
```

That leaves `db`, `auth`, `rest`, `kong`, `pg_meta` and `studio` — everything needed to browse
tables and run the database tests. Storage, realtime subscriptions and edge functions are not
used by this project yet; add them back if that changes.

Check what is actually running before assuming it is broken:

```bash
npx supabase status      # lists stopped services explicitly
docker ps                # should show ~6 supabase_* containers
```

> The keys printed by `supabase start` are the standard local development keys. They are
> identical on every machine, are published in Supabase's own documentation, and are not
> secrets. Your real keys live in `.env` and are never printed.

### Rebuilding from scratch

```bash
npx supabase db reset
```

Drops the local database and replays every migration. **Run this before pushing schema
changes** — it is the only thing that proves your migrations work on an empty database
rather than only on yours.

### Writing a migration

```bash
npx supabase migration new add_orders_table
```

Creates a timestamped file in `supabase/migrations/`. Rules the project follows:

1. **One file, one responsibility.** A table, a function, an enum, a set of policies — not
   all four in one file. Look at the T-020 migrations for the pattern.
2. **Append-only.** Never edit a migration that has been pushed or merged. Everyone who
   already ran it would be in a different state from a fresh clone. Correct it with a new
   migration.
3. **RLS ships with the table.** Tenant isolation is a project invariant. A table without a
   policy is a table any authenticated user can read.
4. **Constraints belong in the database too.** The Zod contract in `packages/shared` guards
   the application, but a sync job, an admin client, or a hand-written SQL fix bypasses it.
5. **Comment the why.** Every T-020 migration explains its reasoning; the *what* is already
   in the SQL.

### After changing the schema

Regenerate the types the whole monorepo depends on:

```bash
npx supabase gen types typescript --local > packages/integrations/src/supabase/database.types.ts
```

Commit that file with the migration. If they drift, `apps/web` and `apps/api` are typed
against a database that no longer exists.

### Testing a migration

Schema and RLS tests live in `packages/integrations/src/supabase/*.itest.ts`:

```bash
npm run test:integration -w @pakcommerce/integrations
```

These are tier-2 tests — they need the local stack running. The default `npm run test` skips
them so a teammate without Docker can still run the unit suite.

### Deploying to the hosted project

```bash
npx supabase login
npx supabase link --project-ref lnznyolcbmqxnweuvawf
npx supabase db push
```

`db push` applies pending migrations to the hosted database. It is deliberately a human
action, run from a machine with credentials — no CI job does it and no agent does it.
