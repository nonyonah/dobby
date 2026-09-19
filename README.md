# Dobby

Dobby is a personal finance and bookkeeping workspace — income, expenses,
budgets, transactions, insights, and tax readiness in one calm interface.

Built with Next.js (App Router), React, TypeScript, Tailwind CSS v4,
shadcn/ui primitives on Base UI, Recharts, Phosphor icons, and Motion.

## App (`web/`)

| Route | Page |
|---|---|
| `/` | Dashboard — income vs expenses, budget snapshot, recent transactions, tax insights, needs-attention queue |
| `/transactions` | Searchable, sortable, filterable transaction table with bulk export/delete, detail drawer, and edit/import flows |
| `/budget` | Per-category budgets (fixed or % of income) with progress tracking, donut summary, and a detail drawer (monthly bars, tracked-source split, transactions) |
| `/insights` | Overview (net income, expenses, cash balance, AI summaries, cash-flow chart) and Tax (deductions, position, checklist, Q&A) tabs with a custom date-range picker |

Design system: Rift Labs tokens (Inter/Geist-style type scale, JetBrains Mono
numerals, hairline borders, single indigo accent) applied over real shadcn
components, with full light/dark (system) theming.

```bash
cd web
npm install
npm run dev     # http://localhost:3000
npm run build
```

## Skills (`opencode:skills/`)

- `rift-labs` — the Rift Labs product design system all UI follows.
- `analytics-bookkeeping-dashboard` — dashboard patterns and references.

## Prototype (`rift-labs-demo/`)

The original static HTML prototype that preceded the Next.js migration.
