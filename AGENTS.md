# Agent Instructions & Project Guidelines — PakCommerce AI

This document establishes operational conventions and architectural guidelines for AI coding assistants working on the PakCommerce AI repository.

---

## 1. Monorepo Architecture

- **`apps/web`**: Next.js (App Router), Tailwind CSS, Lucide icons, Polaris-aligned design patterns.
- **`apps/api`**: Express.js, TypeScript, Vitest, Supabase Auth integration, Copilot services.
- **`apps/ml`**: FastAPI Python microservice (pinned to Python 3.12).
- **`packages/shared`**: Shared TypeScript contracts, Zod schemas, domain models, and utilities.
- **`packages/integrations`**: Supabase client and typed PostgreSQL definitions.
- **`supabase/`**: Local Supabase configuration and SQL migrations (`supabase/migrations/`).

---

## 2. Git & PR Workflow Rules

1. **Never commit directly to `main` or `dev`**.
2. **Branch Naming**:
   - Features: `feature/sXX-tXXX-short-name-person` (or `feature/tmisc-...`)
   - Fixes: `fix/tXXX-short-name-person`
   - Docs: `docs/topic-person`
3. **Commit Syntax**: Conventional commits:
   - `feat(scope): message`
   - `fix(scope): message`
   - `test(scope): message`
   - `docs(scope): message`
   - `chore(scope): message`
4. **Pull Requests**:
   - Always target `dev` (never `main`).
   - Fill in the PR template (`.github/PULL_REQUEST_TEMPLATE.md`).
   - Ensure all 8 GitHub Actions CI checks pass before merging.

---

## 3. Database & Supabase Migration Tracking

**Golden Rule**: Never guess migration states or run expensive custom queries against `information_schema`. Use the Supabase CLI commands.

- **Check migration sync status**:
  ```bash
  npm run db:status
  # or: npx supabase migration list
  ```
  Returns a clean, instant comparison of local migration files vs remote ledger records.
- **Apply pending migrations**:
  ```bash
  npm run db:push
  # or: npx supabase db push
  ```
  Applies all pending migrations in `supabase/migrations/` and updates `supabase_migrations.schema_migrations`.
- **Repair migration ledger (if applied out-of-band)**:
  If DDL was executed manually in the dashboard, stamp it without re-running SQL:
  ```bash
  npx supabase migration repair --linked --status applied <version>
  ```
- **Type Generation**:
  Whenever migrations alter schema:
  ```bash
  npx supabase gen types typescript --linked > packages/integrations/src/supabase/database.types.ts
  ```

---

## 4. Pre-Commit Validation Checklist

Before opening any PR, always run:
1. `npm run typecheck` — Monorepo-wide TypeScript check.
2. `npm run test` — Unit test suites across all workspaces.
3. `npm run lint` — ESLint validation.
4. `npm run build` — Next.js and library build verification.
