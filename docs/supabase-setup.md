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
npx supabase gen types typescript --linked > packages/integrations/src/supabase/database.types.ts
```

Commit that file with the migration. If they drift, `apps/web` and `apps/api` are typed
against a database that no longer exists.

> **`--linked`, not `--local`.** The two do not produce the same file. The linked project
> runs PostgREST 14.5 and emits an `__InternalSupabase: { PostgrestVersion: "14.5" }` block
> that the local stack (PostgREST 16.1) omits. Generating from `--local` silently drops it.
> The apps talk to the hosted project, so that is the one the types must describe.
>
> To check the two databases still agree, diff their schemas rather than their types:
>
> ```bash
> npx supabase db dump --linked --schema public -f prod.sql
> npx supabase db dump --local  --schema public -f local.sql
> diff prod.sql local.sql
> ```

### Testing a migration

Schema and RLS tests live in `packages/integrations/src/supabase/*.itest.ts`:

```bash
npm run test:integration -w @pakcommerce/integrations
```

These are tier-2 tests — they need the local stack running. The default `npm run test` skips
them so a teammate without Docker can still run the unit suite.

### Schema design rules this project follows

Learned the expensive way while building the product catalogue. They apply to every table
added from here on.

**1. Identity is ours.** `products.id` is a UUID we generate, never Shopify's or Daraz's id.
The same product can live on several platforms at once — that is the point of multi-store
sync — and a primary key can only be one of them. External ids also collide across providers
(WooCommerce `445` and Daraz `445` are unrelated), arrive in incompatible formats, are absent
for products created inside PakCommerce AI, and can change when a seller reconnects a store
while our orders still point at `product_id`.

External ids belong in a **mapping table**, one row per store a product appears in — arriving
in Phase 4 with the connectors. Never add a provider-specific column such as `shopify_id` to
a domain table: it works right up until the second platform arrives.

**2. Derived data is derived.** `product_variants.inventory_state` is a generated column
computed from `track_inventory`, `quantity_on_hand` and `low_stock_threshold`. A writable
status column would be a second source of truth for stock and would eventually disagree with
the quantity — which surfaces as a customer buying something that is not there.

**3. Money is an integer.** Prices are stored in minor units (paisa), never floats. Currency
is its own column with an ISO-shape check rather than a hard-coded `PKR`.

**4. Constraints go in the database too.** The Zod contract in `packages/shared` guards the
application, but sync jobs, admin clients and hand-written SQL all bypass it. A rule that
protects data integrity is expressed in both places, because only one of them cannot be
skipped.

**5. Tenant isolation is structural.** RLS policies, plus a composite foreign key
`(workspace_id, seller_id) → workspaces (id, seller_id)` that makes a product whose seller and
workspace disagree unrepresentable. Neither depends on a developer remembering anything.

**6. Grants are not the same as policies.** A policy decides *which rows* a role may touch; a
grant decides whether it may touch the table **at all**. Two consequences:

- Supabase configures `alter default privileges ... grant all on tables to anon`, so every new
  table is reachable by logged-out requests unless you **`revoke`** explicitly. Staying silent
  is not the same as granting nothing.
- A policy cannot restrict a *column*, only a row — so a seller could always edit
  `verification_status` on their own row. Only `grant update (col, col)` stops that.

**7. Generated types are not a schema.** `database.types.ts` describes columns, types and
foreign keys. It says nothing about defaults, indexes, triggers, constraints, RLS or grants.
A baseline of an existing database must come from `db dump`, never from types — reconstructing
one from types produced a file that was wrong in eleven ways.

### Deploying to the hosted project

```bash
npx supabase login
npx supabase link --project-ref lnznyolcbmqxnweuvawf
npx supabase db push
```

`db push` applies pending migrations to the hosted database. It is deliberately a human
action, run from a machine with credentials — no CI job does it and no agent does it.
