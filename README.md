# PakCommerce AI

Final Year Project monorepo for PakCommerce AI — an AI-powered commerce platform.

## Structure

```
├── apps/
│   ├── web/              # Frontend
│   ├── api/              # Main backend API
│   └── ml/               # ML service (FastAPI)
├── packages/
│   ├── ai/
│   ├── shared/
│   └── integrations/
├── docs/
└── scripts/
```

## CI/CD

- **CI** runs on every PR to `dev` / `main` (lint, typecheck, test, build)
- **CD** builds artifacts on `main`; deploy is opt-in until hosting is configured

See [docs/ci-cd.md](docs/ci-cd.md) for the full guide.
See [docs/supabase-setup.md](docs/supabase-setup.md) for frontend/backend Supabase setup.

Run checks locally:

```bash
npm run ci
npm run ci:ml
# or
./scripts/ci-local.sh
```

## Git workflow

See [docs/gitworkflow.md](docs/gitworkflow.md).
