# PakCommerce AI Web

Seller-facing dashboard for PakCommerce AI, built with Next.js, TypeScript,
Tailwind CSS, and shadcn/ui.

## Getting Started

Install dependencies from the monorepo root:

```bash
npm install
```

Start only the web workspace:

```bash
npm run dev --workspace @pakcommerce/web
```

The dashboard shell, preferences, and UI primitives are in place. Login and
register call Supabase Auth. The copilot page is the screen that calls the
API. Orders, inventory, logistics, conversations, approvals, and analytics
still render mock data. Products and customers are empty placeholders.
