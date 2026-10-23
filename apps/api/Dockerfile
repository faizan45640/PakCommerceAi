# syntax=docker/dockerfile:1

# Build context is the repository root, because the API imports the
# @pakcommerce/* workspace packages. On Render, render.yaml sets dockerContext
# to the repo root and dockerfilePath to apps/api/Dockerfile.

FROM node:22-alpine AS deps
WORKDIR /app

# Copy only the manifests first so `npm ci` is cached independently of sources.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/ai/package.json packages/ai/
COPY packages/shared/package.json packages/shared/
COPY packages/integrations/package.json packages/integrations/

RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build -w @pakcommerce/api

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# node_modules is copied wholesale from the install stage: the workspace links,
# nested per-workspace dependencies (npm hoists zod 3 at the root but zod 4
# under apps/api), and native optional dependencies are resolved correctly there.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/packages ./packages
COPY --from=build /app/apps/api/dist ./apps/api/dist

USER node

EXPOSE 4000

CMD ["node", "apps/api/dist/index.js"]
