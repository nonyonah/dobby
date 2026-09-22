# Dobby — Backend Planning Session Handoff

_Last updated: 2026-09-21_

Use this document as context for the next agent session. The user has now confirmed the backend stack and product constraints below. The user may still provide an additional implementation prompt; read it before coding.

## Project

- Repository: `nonyonah/dobby`
- Frontend: `web/`
- Framework: Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4
- UI: HeroUI v3 wrappers plus project-specific UI components
- Charts: Recharts/Nivo
- Motion: `motion/react`
- Current branch: `main`
- Latest pushed commit: `9bd520c Fix dashboard UI and switch styling`
- Remote: `origin/main`

## Confirmed backend stack and product constraints

- API backend: Node.js + Express
- Authentication: Clerk
  - Google login
  - Email/password login
  - Clerk user ID is the identity boundary for all API/database records
- Database: Supabase-hosted PostgreSQL
- ORM/database access: Prisma
- File/document storage: Cloudflare R2
- AI: Gemini via the official server-side Google Gen AI SDK
- External integrations: Composio, including Gmail, QuickBooks, Xero, and future providers
- Product model: single-user personal finance app for now; keep the schema extensible but do not build teams/workspaces yet
- Production target: production-ready backend, not a throwaway prototype
- Tax: informational estimates only; US and Nigeria first; AI assistance is expected; detailed tax rules are intentionally deferred for a later discussion

### Import roadmap

1. CSV import first
2. OFX/QFX import second
3. Receipt OCR third

### Wallet/account customization flow

Initial wallet/account support is for Base and Solana:

1. User enters a wallet address.
2. User chooses a wallet name.
3. User chooses a customization color.
4. The color appears as a dot in the wallet dropdown.
5. The same wallet appears as an AI-sidebar shortcut with the color dot replacing the icon and the wallet name beside it.

This requires persisted wallet/account records with at least chain, address, display name, color, active/default state, validation status, and timestamps. Do not treat a client-side wallet-connected boolean as proof of ownership.

### Official documentation notes verified

- Clerk Express: use `@clerk/express`, `clerkMiddleware()` before other middleware, and `getAuth(req)`/Clerk client checks to protect routes. Configure Google as a Clerk social connection; production Google OAuth requires custom credentials and redirect configuration.
- Supabase + Prisma: use a dedicated Prisma database role. A persistent Express server can use a direct or Supavisor session-mode connection; transaction-mode pooling is for serverless/short-lived connections and requires Prisma pooler settings such as `pgbouncer=true` where applicable. Keep migration and runtime connection URLs intentionally separate if needed.
- Cloudflare R2: use the S3-compatible API with `@aws-sdk/client-s3`; generate short-lived server-side presigned PUT/GET URLs, scope object keys by user, restrict content types/sizes, and never expose R2 credentials to the browser.
- Gemini: use the official `@google/genai` SDK from the server only. Keep API keys private and use structured JSON/schema-constrained output for transaction extraction, categorization, OCR post-processing, and tax explanations. AI output must be validated and treated as untrusted until checked against application rules.
- Composio: use the current TypeScript SDK/session model with the Clerk user ID as the Composio user identifier. Store connection metadata/status in the application database while letting Composio handle provider OAuth/token lifecycle. The current Composio TypeScript SDK is ESM-only and its docs require Node.js 22.22.3 or newer; pin compatible versions and use ESM consistently in the backend. Gmail scopes must be minimized. QuickBooks requires environment-aware OAuth configuration; Xero requires custom OAuth credentials.

Primary docs consulted: Clerk Express quickstart/middleware/social connections, Supabase Postgres connection pooling and Prisma integration, Cloudflare R2 S3/presigned URL docs, Google Gen AI structured-output/JavaScript SDK docs, and Composio provider/session/Gmail/QuickBooks/Xero docs.

## Important workspace state

There are currently uncommitted frontend styling changes. Do not reset, revert, or overwrite them:

```text
M web/app/globals.css
M web/components/breakdown-pie.tsx
M web/components/budget-board.tsx
M web/components/ui/select.tsx
M web/components/ui/switch.tsx
```

These changes are compacting dropdowns/toggles, aligning budget summary cards with goals, and applying dropdown colors:

- Light dropdown background: `#F3F3F3`
- Dark dropdown background: `#2C2D2F`

The latest production build passed after these changes. Targeted ESLint passed for changed components. Full-project lint has unrelated pre-existing errors elsewhere.

## Product surface

### `/` Dashboard

- Income vs. expenses
- Net income and saving rate
- Cash-flow visualization
- Budget snapshot
- Recent transactions
- Tax insights
- Needs-attention queue
- Customizable dashboard cards/reset layout

### `/transactions`

- Ledger and review views
- Search, sorting, pagination
- Filters: category, date range, recurring, tax status, source
- Transaction details drawer
- Edit/delete transactions
- Bulk delete
- Review/approve individual transactions
- Approve all/reviewed transactions
- CSV/XLSX export
- Import UI for CSV/TXT/OFX/QFX, receipt image/PDF, and manual entry
- Current receipt and parsing flows are simulated locally

Key files:

- `web/app/(app)/transactions/page.tsx`
- `web/components/tx-table.tsx`
- `web/components/review-queue.tsx`
- `web/components/tx-edit-dialog.tsx`
- `web/components/tx-import-dialog.tsx`

### `/budget`

- Fixed budgets
- Percentage-of-income budgets
- Create/edit/delete
- Category include/exclude
- Progress meters and donut summary
- Monthly spend bars
- Source/feed breakdown
- Category detail drawer
- Recent category transactions
- Budget status/remaining calculations

Key files:

- `web/app/(app)/budget/page.tsx`
- `web/components/budget-board.tsx`
- `web/components/budget-dialog.tsx`
- `web/components/budget-drawer.tsx`
- `web/lib/budgets.ts`

### `/budget/goals`

- Create/edit/delete goals
- Active, ready, archived states
- Target amount
- Monthly contribution
- Target date
- Funding source
- Contributions
- Spending association
- Progress projections
- Archive/restore
- Reactivation-after-spending preference

Current contribution/spending buttons use hardcoded `$250` operations and a hardcoded date.

Key files:

- `web/app/(app)/budget/goals/page.tsx`
- `web/components/goals-section.tsx`
- `web/lib/goals.ts`

### `/insights`

- Cash-flow tab
- Spending-by-category tab
- Income-by-source tab
- Tax tab
- Date/month range controls
- Income, spending, net, and saving-rate metrics
- Cash-flow visualizations
- Spending/income tables
- Export actions
- Deductions and caps
- Tax estimate/trend
- Filing checklist
- Tax jurisdiction preference
- Advisory-only disclaimer

Key files:

- `web/app/(app)/insights/page.tsx`
- `web/components/flow-sections.tsx`
- `web/components/breakdown-pie.tsx`
- `web/components/cashflow-viz.tsx`
- `web/lib/insights-data.ts`

### `/settings`

- Profile fields
- Country, currency, theme, accent, tax jurisdiction
- Notification toggles
- Wallet connection placeholder
- Bank connection placeholder
- Gmail/Outlook placeholders
- QuickBooks/Xero placeholders
- Google Sheets placeholder
- CSV export
- Subscription placeholder
- Category/rules navigation

Key file: `web/components/settings/settings-page.tsx`

### `/settings/categories-rules`

- Create/rename/archive categories
- Create/delete categorization rules
- Taxable flag on rules
- Re-apply rules placeholder action

Key file: `web/components/settings/categories-rules-page.tsx`

## Current backend reality

There is no application backend yet:

- No auth/session library
- No database
- No API routes
- No server actions
- No ORM
- No Supabase/Firebase integration
- No fetch/Axios/API client
- No file storage
- No background jobs
- No real bank/wallet/email/accounting integrations

Almost all feature state is React state and resets on reload. Existing browser persistence is limited to sidebar collapsed state, accent color, and tax jurisdiction.

## Static/mock data sources

- `web/lib/transactions.ts` — transaction ledger fixtures
- `web/lib/review-queue.ts` — review fixtures
- `web/lib/finance.ts` — categories, account balances, tax/attention fixtures
- `web/lib/budgets.ts` — budget definitions and derived mock bars
- `web/lib/goals.ts` — goal seed data
- `web/lib/insights-data.ts` — yearly/monthly/category/source/tax fixtures
- `web/lib/recurring.ts` — recurring detection fixture/history
- `web/lib/format.ts` — formatting utilities

There are currently competing sources of truth:

- `TRANSACTIONS_FULL` vs. other transaction fixtures
- Static category spending vs. ledger transactions
- Static monthly series vs. actual ledger activity
- Static tax values vs. taxable transactions
- Mock recurring history merged into rows

The backend must establish one canonical ledger and derive dashboard, budgets, goals, insights, tax, recurring, and attention views from it.

## Recommended core entities

At minimum:

- `users`
- `workspaces` or personal accounts
- `sessions`
- `accounts`
- `transactions`
- `transaction_imports`
- `transaction_review_items`
- `categories`
- `categorization_rules`
- `budgets`
- `budget_categories` / exclusions
- `goals`
- `goal_contributions`
- `goal_spending_associations`
- `recurring_patterns`
- `tax_profiles`
- `tax_deductions`
- `tax_documents` / checklist items
- `notifications` / attention items
- `integration_connections`
- `audit_events`

## Recommended backend sequence

### Phase 1 — Auth and ownership

- Scaffold a separate Express API with production configuration
- Add Clerk middleware and protected route helpers
- Enable Google and email/password in Clerk
- Synchronize/upsert the Clerk user into the application database
- Persist profile/preferences
- Implement real logout on the frontend through Clerk
- Add single-user ownership checks to every repository/service query
- Add wallet/account records for Base and Solana
- Integrate wallet discovery, balances, and transaction history through the selected provider (Alchemy preferred for the active Base scope; current Blockscout adapter remains isolated). Wallet ownership signatures are not required.
- Add structured error handling, request IDs, validation, rate limits, CORS, health checks, and secure environment management

### Phase 2 — Canonical ledger

- Accounts and categories
- Transaction CRUD
- Search/filter/sort/pagination
- Transaction audit history
- Replace fixture reads on transactions page

### Phase 3 — Import/review pipeline

- Request an R2 presigned upload URL from Express. (Implemented for CSV.)
2. Upload the raw file directly to R2.
3. Create an import record and process CSV asynchronously.
4. Parse and normalize rows.
5. Deduplicate using stable source/account/date/amount/description fingerprints.
6. Apply categorization rules.
7. Run Gemini only where AI adds value, with schema validation and confidence tracking.
8. Send low-confidence rows to review.
9. Approve/edit.
10. Commit approved transactions to the canonical ledger in a transaction-safe operation.
11. Recompute budgets, insights, recurring detection, tax estimates, and attention items.

Start with CSV. Add OFX/QFX after the CSV contract is stable. Add receipt OCR through R2 + Gemini vision/document extraction only after the import/review foundation is reliable.

### Phase 4 — Budgets and goals

- Budget CRUD and percentage calculations
- Category exclusions
- Goal CRUD
- Contributions and spending associations
- Progress/projections

### Phase 5 — Derived analytics

- Dashboard totals
- Insights aggregations by date range
- Cash-flow charts
- Spending categories and income sources
- Recurring detection
- Needs-attention generation

### Phase 6 — Tax and integrations

- Tax profiles and jurisdiction rules
- Taxable classification
- Deductions and documents
- Gmail/Outlook receipt ingestion
- Bank connections
- QuickBooks/Xero/Google Sheets adapters
- Background sync, retries, cursors, and audit logs

## Implementation progress

Completed on 2026-09-21:

- Created a separate top-level `api/` Express service.
- Pinned the backend to Node.js `22.22.3+` for compatibility with the planned Composio TypeScript SDK.
- Added TypeScript native ESM configuration, environment validation, security middleware, CORS, rate limiting, request IDs, Pino logging, health checks, and structured errors.
- Added `@clerk/express` middleware and a protected `/v1/me` bootstrap endpoint.
- Added a validated `PATCH /v1/me` profile-preferences endpoint.
- Added owner-scoped wallet CRUD endpoints with Base/Solana address validation.
- Added a Blockscout address-summary adapter and `GET /v1/wallets/:id/summary` endpoint; chain-specific endpoint configuration remains explicit.
- Added a shared Next.js API client that attaches the Clerk bearer token to Express requests.
- Began frontend migration by loading the transactions screen from `/v1/transactions` and `/v1/reviews` for authenticated users, with fixture fallback during development.
- Wired transaction edit, bulk delete, review approval, and CSV import UI actions to the Express API.
- CSV selection now uploads directly to R2 through the presigned URL flow and refreshes the server-side review queue.
- Added categorization-rule persistence and `/v1/rules` CRUD/reapply endpoints.
- Connected the Categories & Rules settings screen to live category/rule APIs with fixture fallback.
- Added categorization-rule persistence migration `20260921222619_add_categorization_rules`.
- Connected main Settings profile preferences to `GET/PATCH /v1/me` for country, currency, theme, tax jurisdiction, and accent color.
- Connected Goals to live goal loading, creation/editing, contributions, archive/reactivate, and deletion APIs.
- Connected Budget to live category/budget loading plus budget create/edit/exclude/delete mutations.
- Connected Insights cash-flow totals to `/v1/insights/summary` for authenticated selected date ranges.
- Connected the Dashboard income/expenses card to the live September summary endpoint with fixture fallback.
- Connected Dashboard recent transactions, budget snapshot, and needs-attention cards to live transaction, budget, review, and tax-checklist APIs with fixture fallback.
- Added pluggable Nigeria and US tax rule modules with a country registry.
- Added persisted TaxProfile and TaxChecklistItem models, migration `20260921225447_add_tax_profiles`, estimate/profile/checklist endpoints, and user-driven checklist updates.
- Connected the Insights tax estimate and document checklist to live tax APIs.
- Connected the Dashboard Tax Insights card to the persisted tax estimate/checklist APIs so checklist items are visible on the dashboard.
- Connected Insights spending-by-category and income-by-source sections to live monthly insight and transaction APIs with fixture fallback.
- Added `Transaction.assetSymbol` and automatic tax classification for taxable Base wallet assets `USDC`, `cNGN`, and `ETH`; wallet ownership signing is not required.
- Added Alchemy environment placeholders as the preferred wallet-data provider direction; Base is the active wallet-sync scope for now.
- Added an Alchemy Base JSON-RPC asset-transfer adapter and made the wallet summary route prefer it when configured.
- Added OFX/QFX statement normalization support in `api/src/imports/ofx.ts`.
- Added Gemini receipt extraction provider boundary in `api/src/providers/gemini.ts`.
- Added a Resend monthly tax reminder job payload/sender in `api/src/jobs/monthly-tax-reminder.ts`.
- Added Vitest tax bracket tests for Nigeria and US modules.
- User bootstrap now seeds the initial personal finance categories when no categories exist.
- Added owner-scoped account CRUD with active/inactive handling.
- Added owner-scoped category CRUD with soft-archive handling.
- Added categorization rules tied to owned categories, with taxable flags and reapply support.
- Added the canonical transaction ledger API with CRUD, owner-safe account/category relations, search, filters, pagination, sorting, and bulk delete.
- Added Cloudflare R2 presigned CSV upload URLs and owner-scoped import records; raw files are uploaded directly to private R2 objects.
- Added CSV normalization, SHA-256 fingerprinting, duplicate detection, and pending transaction review items.
- Added authenticated review listing plus atomic approve/reject endpoints; approved rows enter the canonical transaction ledger only after a duplicate re-check.
- Added owner-scoped budgets with fixed/percentage modes and category exclusions.
- Added owner-scoped goals with contributions, progress, archive, and reactivation APIs.
- Added canonical transaction-derived insights summaries by date range, category, source, and month.
- Added the initial Prisma schema for Clerk-owned users/profiles, accounts, Base/Solana wallets, categories, transactions, imports, integration connections, and audit events.
- Connected Prisma to the Supabase PostgreSQL database.
- Created and applied the initial migration:
  - `api/prisma/migrations/20260921204737_initial/migration.sql`
- Generated Prisma Client successfully.
- Passed `npm run prisma:validate`, `npm run lint`, and `npm run build`.

### Clerk integration decision

Use Clerk in both layers for different responsibilities:

- `web/` uses the Clerk Next.js SDK (`@clerk/nextjs`) and Clerk UI components/templates such as `SignIn`, `SignUp`, `UserButton`, and `ClerkProvider`. This is the layer that renders the Clerk UI template and handles the browser session.
- `api/` uses `@clerk/express` and `clerkMiddleware()` to verify the request session token. Protected routes use `getAuth(req)` and scope every database query to the Clerk `userId`.
- The Express API does not render Clerk UI and must never trust a client-provided user ID.
- The Next.js frontend sends the Clerk session token through `web/lib/api-client.ts` when calling the Express API.
- Added `@clerk/nextjs` to `web/`, wrapped the app in `ClerkProvider`, added Clerk `SignIn`/`SignUp` UI routes, and added Next.js middleware protection for dashboard routes.

### Still unresolved

1. Express deployment target and background worker deployment; CSV parsing/review processing is not yet asynchronous.
2. Whether Supabase Data API/RLS will be retained in addition to Prisma, or Prisma will be the sole application data path.
3. Move CSV processing from the current bounded request path into a background worker/queue before production-scale imports.
4. Queue/worker choice for imports, OCR, Gemini jobs, and Composio syncs.
5. Confirm Alchemy coverage/endpoints for Base wallet balances and history; ownership signatures are not required.
6. Exact CSV column formats/providers for the first import.
7. Configure Composio shared provider OAuth connections and select the first provider workflow: Gmail, QuickBooks, Xero, or another.
8. Tax AI explanations and production tax review; deterministic Nigeria/US informational calculations are now implemented from the supplied rules, but must be reviewed by a tax professional before production claims.
9. Data retention, encryption, export, account deletion, and audit-log requirements.

## Security requirements

Financial and tax data require:

- Authenticated workspace isolation
- Server-side authorization on every record access
- Encrypted integration credentials
- Secure/private receipt storage
- Idempotent imports and webhooks
- File type/size/malware validation
- Audit history for transaction edits, approvals, rule runs, exports, and tax changes
- PII minimization and deletion/retention policy
- Never trust a client-side wallet-connected flag
- Explicit tax-advice boundaries

## Final handoff before user testing

The core backend and frontend integration slices are implemented. The database is synchronized through the tax and transaction asset migrations. Provider adapters/configuration are present for Alchemy Base, Gemini receipt extraction, OFX/QFX normalization, and Resend monthly tax reminders. Composio is installed/configured as the next OAuth integration boundary; shared-provider connection flows still require the user’s provider setup and credentials.

User testing should begin with Clerk auth, profile/settings persistence, transaction CRUD, CSV/R2 review approval, budgets/goals, insights, tax checklist/estimate, and Dashboard cards. Do not run npm tests if intentionally skipping automated tests; the Vitest tax tests exist but were not included in the final validation request.

## Next-session instruction

Read this file first. The backend service and initial Supabase migration now exist. Continue with the first authenticated vertical slice: connect the Clerk session token from Next.js to live screens, then implement the canonical transaction ledger and CSV import/review pipeline. Do not implement detailed tax rules or live wallet syncing until their requirements and ownership-verification policy are agreed.
