---
name: rift-labs-design-system
description: Rift Labs product design and implementation rules for Dobby. Enforces the Rift Labs visual language, accessibility, interaction patterns, and component behavior on a HeroUI v3 + Tailwind v4 + Next.js foundation (sidebar and charts intentionally remain shadcn). HeroUI primitives are wrapped to preserve the Rift prop API. Icons are Phosphor (filled sidebar nav, regular elsewhere).
---

# Rift Labs Design System Skill

## Purpose

You are Dobby's UI implementation/design-system skill for Rift Labs products.

The Rift Labs product surface is quiet, dense, and operational: a transparent
navigation rail flush to the screen edge, one elevated app shell, borderless
white modules floating on soft shadows, hairline separators, compact 13/12px
type, JetBrains Mono data values, and a single indigo accent reserved for
interaction. Status is never color alone — every tone pairs with an icon or
explicit text.

The stack is HeroUI v3 (`@heroui/react` + `@heroui/styles`, imported in
`globals.css`) on Tailwind v4 + Next.js, with Google Sans Flex as the
product typeface and JetBrains Mono for data. HeroUI primitives are wrapped
so the Rift prop API (variant/size names) is preserved — e.g. `Button`
maps Rift `primary/secondary/outline/ghost/destructive` onto HeroUI
variants. Two areas intentionally remain shadcn and must not be migrated
without cause: the **sidebar** (shadcn Sidebar foundation) and **charts**
(shadcn Chart + recharts).

## Non-negotiable foundations

Dobby is built on installed HeroUI v3 components (`@heroui/react`),
not hand-rolled copies — `Table`, `Switch`, `Popover`, `Modal`, `Select`,
`Input`, `DateField`/`DateRangePicker`, `Card`, `Button`, `AlertDialog`,
`Alert`, and siblings. New primitives come from HeroUI, wrapped so Rift
prop names, sizes, and tokens survive (see `components/ui/button.tsx`:
Rift variants mapped onto HeroUI variants).

Deliberately excluded from the migration — shadcn, do not touch without
cause: the **sidebar** (`components/ui/sidebar.tsx`) and **charts**
(`components/ui/chart.tsx` + recharts).

- After any upstream component change, re-apply Rift morphs (button
  especially) before finishing.
- The underlying accessible behavior (Base UI where shadcn pieces remain,
  HeroUI/RAC elsewhere) is an implementation detail; Rift Labs supplies
  the visual language everywhere. Never let stock library styling ship
  un-themed.
- `motion` (`motion/react`) is for micro-interactions only: floating-panel
  entrances, bulk-action bar pop-in, collapsible group glides. Never for
  decoration.

### Library hierarchy

The design system, not the component library, is the source of visual truth:

1. **Rift Labs design tokens and explicit component rules**
2. **Existing project components and established patterns**
3. **Chosen library's accessible behavior and component semantics**
4. **Chosen library's implementation defaults**
5. **General UI conventions**

---

# Foundations

## Color

### Core palette (light)

- Ink 900: `#17181c`
- Ink 700: `#2b2d33`
- Ink 500: `#6b6d72`
- Paper 000 (app background): `#F9FAFB`
- Shell surface: `#ffffff`
- Card surface: `#ffffff`
- Paper 100: `#f1efeb`
- Paper 200: `#e9e7e2`
- Line (borders): `#e0ddd7`
- Input border: `#d8d6d0`
- Soft input border: `#e9e7e2`
- Text: `#1c1d20`
- Text muted: `#6b6d72`
- Faint text: `#8a8b91`
- Accent (interactive): `#4a55c9`
- Accent 600: `#3a44a8`
- Accent 100: `#eceefb`
- Success green: `#35754e` / Green 100 `#e4efe7`
- Vivid chart green: `#22C55E`
- Warning amber: `#ad7f22` / Amber 100 `#f6ecd6`
- Danger red: `#b0402f` / Red 100 `#f7e6e2`
- Vivid chart red: `#F04438`

### Semantic mapping

- App/window background: Paper 000 `#F9FAFB`
- Elevated shell: white, 12px radius, hairline border, restrained shadow
- Cards/modules: white, borderless, 10px radius, soft two-layer shadow
- Borders/hairlines: Line; subtle hairlines may use Paper 200
- Primary text: Text; secondary text: Ink 500 / faint
- Interactive accent: Accent; links on hover go Ink
- Success: Green; warning: Amber; destructive/error: Red
- Data-viz greens/reds are the vivid pair (`#22C55E` / `#F04438`)

### Dark mode

Dark mode follows the OS (`prefers-color-scheme`; do NOT redefine the
`dark` variant — Tailwind's default media strategy is the mechanism):

- App background: `#09090A`
- Shell: `#121213` (borderless in dark — remove the shell border, keep shadow)
- Cards/modules: `#161617`
- Sidebar active fill: `#18181A`
- Foreground: `#eceef0`; muted: `#a2a3a8`
- Popover/dialogs: `#1a1a1d`; inputs: `#232327`
- Borders/hairlines: `#2d2d31` / `#26262a`
- Pastel status pills keep their light fills in both modes unless a
  specific dark pair is defined; body text brightens to `#eceef0`,
  muted text to `#a2a3a8`
- Charts read CSS variables (`--chart-grid`, `--chart-cursor`,
  `--chart-tick`) so plots follow the theme with no prop changes

## Typography

Product typeface (variable, full weight range + optical sizing):

- **Google Sans Flex** via `next/font` (`--font-sans-flex`), wired through
  the Tailwind `--font-sans` token. Inter remains the fallback stack.

Monospace (values, amounts, code, data labels):

- **JetBrains Mono** (`--font-jetbrains-mono`)

Scale (compact operational UI):

- Page title (top bar): 14px semibold
- Section/module titles: 13px semibold
- Body/labels/nav: 13px, medium weight for labels, nav items, buttons
- Captions/meta/footers: 12px
- Hero values (stat/card headlines): 16–20px semibold Mono
- Chart ticks: 11px muted

Body baseline: 13px, weight 400, line-height ~1.55, antialiased.
Type should feel compact and quiet. Avoid oversized marketing-style type
inside application interfaces.

## Spacing

8px base scale: 4px (tight/icon contexts), 8px, 12px, 16px, 24px, 32px,
48px. Page gutters are 8px around the shell; content padding is 24px.

## Radius

- App shell: `12px`
- Cards/modules: `10px`
- Buttons: `10px`
- Inputs/select triggers: `6px`
- Dialog: `12px`
- Pills/badges: fully rounded
- Avoid excessive rounding. This is not a "rounded everything" design.

## Borders, shadows, elevation

- Cards/modules are **borderless white** with one soft two-layer shadow
  (`0 1px 2px` + `0 4px 16px` at low alpha). No hairline card borders.
- The shell keeps a hairline border in light mode (removed in dark mode,
  where shadow alone separates it).
- Hairline separators divide stacked content (table rows, list rows,
  drawer sections, footers).
- Floating UI (dropdowns, popovers, dialogs, drawers, bulk-action bar,
  command palette) uses restrained shadows.
- Never add decorative drop shadows beyond separation.

---

# App shell and layout

The shell is Linear-style: navigation sits transparent on the viewport
background flush to the screen edge; the main panel is the elevated
surface stretching to the top/right/bottom edges with an 8px gutter.

## Viewport

- `min-h-screen` app background; page scroll lives at the window so the
  scrollbar sits outside the shell.
- Shell fills at least the viewport (`min-h` = viewport minus gutters)
  and grows with content.

## Sidebar (shadcn Sidebar foundation)

A transparent 248px rail (`--sidebar-width: 248px`), offcanvas collapse,
no right border, no rail chrome:

- Sits directly on the viewport background, flush to the left screen edge.
- Workspace label (avatar mark + name) is static text, not a dropdown.
- Nav: 13px medium, icon + label travel together, 6px radius, compact
  padding. Active item is a soft fill (light: black 6%; dark: `#18181A`),
  never text color alone. Counts are right-aligned, muted, tabular.
- Unselected items stay quiet; footer holds secondary items (e.g. Settings).
- Collapse persists (localStorage + shadcn controlled state); ⌘B toggles.
- Collapsed state leaves a 12px edge hover-strip that opens the same
  sidebar as a floating rounded panel (accent edge grip, Escape closes,
  never drives layout).
- Sidebar is a real `<nav>` landmark; main content uses `<main>`.
- Mobile falls back to the shadcn sheet automatically.

## Top bar

Sticky, flush to the shell top (square corners — rounded tops let content
peek through while stuck), opaque shell-matching background, hairline
bottom border:

- Left: sidebar trigger + 14px semibold page title.
- Right cluster: command-palette trigger (icon + ⌘K), notifications
  dropdown (unread dot + count), avatar menu, then the screen's single
  primary action last.
- The bar must be fully opaque; translucency lets scrolled content bleed.

## Floating helpers

- Contact-support: circular bordered button pinned bottom-right with a
  small contact card.
- Bulk-action bar: dark pill bottom-center on row selection (count +
  Export + two-step Delete + clear), motion pop-in.

---

# Iconography

Single icon pack: **Phosphor** (`@phosphor-icons/react`, SSR entry for
Next.js prerendering):

- Sidebar navigation: **filled** weight, 16px.
- Everything else: **regular** weight; color inherits soft text tones
  (`currentColor`). Status icons pair with their tone; never color alone.
- Representative set: squares-four (dashboard), arrows-left-right
  (transactions), chart-bar (insights), wallet (budget), gear-six
  (settings), trend-up/down, check, X, upload-simple, magnifying-glass,
  plus, bell, funnel-simple, tag, currency-dollar, calendar-blank,
  receipt, warning-circle, question, pencil-line, envelope-simple,
  credit-card, caret-up-down, chevrons.
- Category identity uses emoji (🛒 🏠 💡…), not icons.
- Category/source glyphs in `components/icons.tsx` wrap Phosphor with
  fixed sizes; shadcn stock files import Phosphor directly.
- Icon-only buttons require an accessible label.

---

# Component rules

## Button (HeroUI, Rift prop API preserved)

Variants: `primary` (accent fill, white text — exactly one per screen),
`secondary` (white/bordered neutral), `outline` (kept for shadcn
compat, styled as secondary), `ghost`, `destructive`.

Sizes: `default` 32px / 13px / ~14px padding; `small` 26px / 12px / ~10px
padding; `icon` / `icon-sm` squares. Radius 10px, 6px icon gap.

Rules: name actions after what happens ("Import transactions", not
"Confirm"); destructive actions require a second confirmation step
(use the inline two-step confirm button); icon-only buttons need labels;
minimum hit target 24×24; visible 2px accent focus ring with 2px offset —
except text inputs and search, which use a soft border shift with no ring.

## Input / Textarea / Select (HeroUI)

- Input: 32px height, ~10px padding, `#d8d6d0` border (softer `#e9e7e2`
  for search), 6px radius, 13px text, real labels, concise helper text.
- Search carries its filter control docked inside (funnel button with
  active-count badge).
- Select dropdowns: hairline border, 10px radius, one restrained shadow,
  compact items, check on the active option.
- Textarea for notes/comments with placeholder guidance.

## Card (HeroUI, morphed)

Borderless white, 10px radius, soft two-layer shadow, dark `#161617`.
Module pattern: 13px semibold title left, muted 12px drill-in link right
(chevron), 16px content padding. A `bare` variant renders title + content
with no chrome for flat sections (insights), separated by hairlines.

## Stat / KPI

Label 12px muted, value 20px semibold Mono, trend pill (icon + signed %
+ comparison text, tone never color-alone), expenses invert (down is
good). Values expose one readable phrase to screen readers.

## Table (HeroUI, morphed)

Real semantic `<table>`: header row on a subtle tint with small muted
headers, hairline row separators, numeric columns right-aligned in Mono,
hover tint, accent-tinted selected rows, day-group subheads where
relevant. Sortable headers expose `aria-sort` with direction icons.
Row checkboxes use real inputs with `aria-label="Select row: …"`.
Pagination pairs page buttons with plain language ("Showing 1–12 of 24").
Empty states say what to do next, not just what's missing.

## Filter menu + pills + totals

Filters live in one sectioned dropdown (Filter by rows with icons, live
value summaries and chevrons; drill-in option lists with accent checks;
Sort by group; Reset all footer). Active filters surface as vivid indigo
pills (accent border/fill/text, dark pair included), each dismissible,
alongside live Spent / Income / Net totals across the result set.
Multi-select dimensions (e.g. categories) toggle without closing.

## Bulk actions

Checkbox selection (single or multi) raises the floating dark toolbar:
live count, Export (real CSV download of exactly what's selected), two-step
Delete, clear. Destructive actions always confirm inline.

## Detail drawer (shadcn Drawer — intentionally not migrated)

Right-side floating panel (520px, inset gaps, 12px radius, swipe to
dismiss, screen-reader title): summary headline, small charts, key
metrics, source/origin breakdown, grouped item lists. Edit flows open a
Dialog layered above. Transaction details use the same drawer at 400px.

## Dialog (HeroUI Modal, Rift prop API preserved)

Centered, 12px radius, one-sentence consequence in the description,
Cancel left + named commit action right. Forms use labeled Input/Select
grids.
Overlay containers never show a focus ring (suppress the global outline
on dialog/sheet/drawer surfaces; inner controls keep theirs).

## Dropdown / Popover / Command palette (HeroUI wrappers + cmdk)

- Dropdown menus: icon + label items, muted shortcut hints, destructive
  items in red, compact radius.
- Command palette (⌘K + trigger): Actions and Navigate groups, muted
  empty state, closes on select. Medium width.
- Notifications dropdown: unread dot + count on the trigger, accent dots
  per item, relative timestamps.
- Avatar menu: workspace label, profile/settings/logout.

## Tabs / segmented controls

Pill container with equal-width segments; active gets the surface fill +
subtle shadow. Used for section tabs (Overview | Tax) and period toggles
(Month | Quarter). Keyboard: arrow keys, `aria-pressed` state.

## Timeline scrubber (custom)

Analog-watch ruler: long tick per month, five small ticks between, bold
month labels. Selection is drag-only (months aren't clickable); the edge
is painted imperatively every animation frame (zero React renders while
scrubbing) so it elongates/shrinks at pointer fidelity, with commits
throttled underneath and flushed on release. A day-precision popup
follows the pointer; edge handles are visible accent grips and keyboard
sliders (±1 day, Shift ±7). Custom date ranges come from the shadcn
Calendar (multi-select) in a dropdown above the chart — the scrubber is
currently parked in favor of that control.

## Charts (shadcn Chart + recharts)

- Area: accent series + restrained fill, subtle grid, muted 11px ticks,
  compact `$40k` Y-axis where space allows, dashed accent cursor, dark
  tooltip readout with Mono values.
- Bars: grouped or single-series with 5–6px top radius; over-limit
  values flip the *figure* red while bars keep category color.
- Donut: category shares with center headline numbers beside it.
- Sparklines: full-context line with the selected window shaded.
- Every chart ships an `aria-label` plus a screen-reader data table.

## Progress meters

6px hairline tracks (`#f1efeb`, dark `#26262a`) with status or
category-color fills, `role="progressbar"` with values. Budget bars go
green → amber (≥80%) → red (over); category identity bars use the
category color with the figure carrying over-limit red.

## Badges, dots, pills

- Category pills: emoji + uppercase label on per-category pastel tones.
- Status badges: Taxable (accent tint) vs Non-tax (neutral); Ready
  (green) vs Outstanding (amber); parsing states (Parsed green,
  Needs review amber, Manual muted) — always dot + text.
- Counts cap at `99+` with accessible labels ("8 pending").

## Sidebar primitives

`SidebarProvider` (controlled open state, `--sidebar-width: 248px`,
localStorage persistence), `SidebarTrigger`, `SidebarRail` only where a
resize affordance is wanted (removed on the main rail — it rendered as a
stray edge line), `SidebarMenuButton[isActive]`, `SidebarMenuBadge`.
Mobile sheet, ⌘B shortcut, and collapse persistence come free.

## Emoji picker (emoji-only)

Category, goal, and budget forms use an emoji picker (`EmojiPickerField`
+ `EmojiPicker`) with the full Unicode set (~3,780 fully-qualified emojis
in `components/ui/emoji-data.ts`, generated from unicode.org, grouped by
Unicode block with name search). There is intentionally no icon tab —
an earlier icon side was removed. Never re-add icon picking; category
identity is emoji-only.

## Toasts / empty states / skeletons

- Toasts: one line, tone + dot/icon, `aria-live="polite"`.
- Empty states: lead with the next action ("You're all caught up" over
  "No transactions"), decorative glyphs `aria-hidden`, real headings.
- Skeletons match target shapes; `aria-busy` regions with hidden labels.

## Command palette scoping

Global palette covers Actions + Navigate. Page-level import/export flows
use dedicated dialogs (statement CSV parsed client-side with preview
counts, receipt with simulated parse flagged for review, manual entry
with validation), never the palette.

---

# Content and interaction tone

Calm, precise, operational: concise labels, action-oriented copy, factual
status, plain language, compact helper text. Greetings are time-aware
("Good afternoon, Acme") with range-aware sublines. Finance and tax copy
is advisory-only — "planning only, we don't prepare or file returns" —
stated wherever estimates appear. Avoid vague "Confirm" labels,
decorative copy, exclamation marks, and internal error language.

---

# Accessibility requirements

Accessibility is part of the system, not a refinement: semantic HTML,
visible keyboard focus, real labels, ARIA state relationships, keyboard
navigation, sufficient contrast, reduced-motion preferences, correct
landmarks. Specifics: 4.5:1 body contrast; status never color-alone;
icon-only buttons labeled; decorative icons hidden; inputs labeled with
`aria-invalid`/`aria-describedby` errors; real table semantics with
`aria-sort`; `aria-current` nav; modal focus behavior; tooltips on focus
as well as hover; loading `aria-busy`; `prefers-reduced-motion` disables
all motion (peek panels, bulk bar, group glides, marquee labels).

---

# Implementation rules for Dobby

## Before coding

1. Identify: new component, modification, screen assembly, or new pattern.
2. Inspect existing project components before creating duplicates.
3. Reuse tokens and primitives; only create when the system doesn't cover it.
4. If a HeroUI upgrade overwrites `components/ui/*`, re-apply Rift morphs
   (button especially) before finishing.

## When assembling screens

Compose quiet navigation, clear headings, restrained primary actions,
8px-based spacing, hairline separators, compact tables/lists, Mono data
values, accent only where interaction/state requires it, minimal
decoration. Don't turn every section into a card — flat sections with
dividers are a first-class pattern (insights).

## When modifying components

Preserve semantic API, accessibility behavior, provider primitives,
existing data/logic, and Rift visual tokens. Change only what's needed.

## When a provider component looks wrong

Keep the provider; apply Rift tokens; strip conflicting defaults; match
dimensions, radius, borders, typography, spacing, iconography, states;
re-check focus/keyboard/ARIA. The provider supplies behavior; Rift Labs
supplies the visual language.

## When the system doesn't cover a requirement

Use the closest Rift pattern and its visual grammar; note briefly that
it's new; minimize new tokens; prefer existing conventions; recommend
adding it to the system if it recurs.

## beUI verdict (decided, do not revisit without cause)

beUI's `AISidebar` resource tree was evaluated and removed: its
file-manager metaphor (optimistic drag-moves, inline rename) fights the
quiet Linear-style rail. Keep `motion` for micro-interactions only.

---

# Anti-patterns

Never: ship stock HeroUI styling un-themed; migrate the sidebar or charts
away from shadcn (intentional exemptions); mix icon packs (Phosphor
only — HugeIcons and lucide were fully removed); re-add an icon tab to
the emoji picker; use filled icons outside sidebar nav; use emoji outside
category identity; introduce arbitrary colors; use gradients decoratively;
nest cards; shadow ordinary content beyond separation; use placeholder as
label; communicate state by color alone; use clickable divs; replace
accessible primitives with ad-hoc logic; add arbitrary spacing; duplicate
components; silently choose libraries; redefine the `dark` variant (it
must stay Tailwind's default media strategy — a class-based override
once silently disabled the entire dark mode); HeroUI components are the
mirror case — they need the `.dark` class, synced from the OS by
`components/theme-sync.tsx`, or tables/tabs stay light in dark mode; put focus rings on overlay
containers; force borders onto borderless cards.

---

# Quick reference prompts

- New screen: "Rift Labs screen: quiet nav, page heading, one primary
  action, 8px spacing, hairline separators, compact tables, Mono values."
- Provider choice: HeroUI default (sidebar and charts stay shadcn by
  decision); motion only when movement is the point; recharts via the
  shadcn Chart pattern.

---

# Source of truth

This skill supersedes the original Rift Labs draft wherever they
conflict (light rail vs dark chrome, borderless cards vs border-only,
Google Sans Flex vs Inter, Phosphor-only vs Phosphor+HugeIcons), and the
shadcn era of this repo wherever they conflict (HeroUI primitives with
Rift prop APIs; sidebar and charts intentionally still shadcn). When a
newer Rift Labs source arrives, reconcile explicitly rather than silently
preserving older values.
