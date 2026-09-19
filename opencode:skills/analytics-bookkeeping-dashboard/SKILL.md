---
name: analytics-bookkeeping-dashboard
description: Design and critique analytics, finance, and bookkeeping dashboards using curated Mobbin patterns. Use when the user asks for dashboard moodboards, visual direction for analytics or bookkeeping UIs, SaaS finance dashboards, KPI layouts, or competitor-inspired designs from Monarch, Whop, Xero, Amplitude-style products.
---

# Analytics & Bookkeeping Dashboard Design

Apply this skill when designing, reviewing, or moodboarding dashboards focused on analytics, personal/business finance, or bookkeeping. The patterns come from real shipped products on Mobbin (Monarch Money, Whop, analytics collections, ERP/Xero-style screens).

## Core Visual Themes (use as checklist)

### 1. Layout & Spatial Structure
- Prefer left sidebar (narrow, icon + label) + main content area.
- Top utility bar for search, date range, filters, notifications, avatar.
- Modular card grid — 3–4 KPI cards on top, primary chart middle, secondary lists/tables below or side.
- Generous white space and consistent padding. Separate summary (top) from detail (bottom/side).

### 2. Color Palette & Mood
- Neutral-first — off-white / light-gray backgrounds, soft gray borders, near-black text.
- One strong accent (teal, soft blue, orange, or green) used sparingly for positive trends, primary CTAs, active states.
- Green = positive/up, red/muted coral = negative/down.
- Prefer light mode for trust and clarity (especially finance). Dark mode secondary.
- Mood — calm, professional, trustworthy, modern SaaS. Avoid playful or highly saturated palettes.

### 3. Typography & Hierarchy
- Large bold numbers for primary metrics (revenue, net worth, remaining budget).
- Smaller supporting labels and percentages.
- Clean geometric/system sans-serif. High contrast between primary numbers and labels.
- Short labels only. Avoid dense explanatory paragraphs.

### 4. Data Visualization
- Prefer simple readable charts — line/area for trends, bars for comparisons, donut/pie for category breakdowns.
- Charts live inside cards with title, date range, optional legend/toggle.
- Sparklines or mini-charts inside KPI cards are common and effective.
- Soft fills, thin lines, limited color. No heavy gridlines or 3D.
- Bookkeeping staples — budget progress bars, net-worth trend lines, categorized transaction lists.

### 5. Cards & Components
- Soft rounded cards (8–16 px radius), light shadow or subtle border only.
- KPI card anatomy — large number + trend indicator (% or absolute) + short label.
- Tables — clean rows, status badges, right-aligned currency amounts.
- Subtle interactive affordances (hover, filters, Customize, Export).

### 6. Navigation & Wayfinding
- Persistent left nav with clear groups (Dashboard, Accounts, Transactions, Reports, Budget, Goals).
- Understated active state (tint or accent bar).
- Clear page titles or breadcrumbs.
- Filters and date selectors stay in the top/secondary bar.

### 7. Information Density & Trust
- Balanced density — scannable key numbers, never overwhelming.
- Trust signals — proper currency formatting, explicit time ranges (“This month vs last”), remaining-budget indicators, status badges.
- Progressive disclosure — summary first, then filters/tabs for detail.
- Actions (Export, Customize, Add) visible but secondary.

### 8. Overall Aesthetic
- Modern professional SaaS with finance-grade clarity and calm.
- Scannability and trust over visual flair.
- Modular so components can be rearranged without breaking the system.
- Designed to feel current yet age well (avoid short-lived trends).

## Key Reference Screens (Mobbin)

Always prefer linking or describing these real examples when generating inspiration or critiques:

- **Monarch Web Finance Dashboard** — best bookkeeping reference. Budget progress bars (Fixed/Flexible/Non-Monthly), spending vs last month chart, net worth trend, recent transactions, recurring.  
  https://mobbin.com/explore/screens/a2852c69-d3f2-45cb-b3fd-c6fadfc47977

- **Web Analytics Dashboard collection** — KPI rows, performance-over-time charts, filter panels, clean card layouts (Whop, Navattic, similar).  
  https://mobbin.com/explore/web/screens/analytics-dashboard

- **ERP / Accounting style (Xero and similar)** — overview cards for revenue, invoices, quotes, notification panels.  
  https://mobbin.com/explore/web/screens/erp-system-dashboard

When the user asks for screenshots or visual references, open the above Mobbin URLs (or search Mobbin for the specific app) and describe or capture the current screens. Do not invent UI details that contradict these patterns.

## How to Apply

1. Start every dashboard proposal by mapping it to the 8 themes above.
2. For moodboards — structure as Top (KPI + primary chart), Middle (budget/progress + transactions), Bottom (breakdowns + filters).
3. When critiquing existing work, score against the themes (especially hierarchy, density, trust signals, and modularity).
4. Prefer light mode + single accent for finance/bookkeeping contexts unless the user explicitly requests dark mode.
5. Keep currency, percentages, and time ranges explicit and correctly formatted.

## Supporting Assets

- Full moodboard + themes PDF — `assets/Mobbin_Analytics_Bookkeeping_Dashboard_Moodboard.pdf`
- Detailed theme expansions and competitor notes live in `references/` when needed.

## Anti-patterns to Avoid

- Dense walls of charts without hierarchy.
- Multiple competing accent colors.
- Overly playful illustrations or heavy decorative elements in primary finance views.
- Hiding critical filters or date controls.
- Missing trust signals (no “vs previous period”, unclear currency, no remaining-budget cues).
