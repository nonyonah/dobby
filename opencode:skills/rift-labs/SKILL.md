---
name: rift-labs-design-system
description: Rift Labs product design and implementation rules for Dobby. Enforces the Rift Labs visual language, accessibility, interaction patterns, and component behavior while supporting shadcn/ui and beUI. shadcn/ui is the standard product UI library; beUI is used for motion/animated components; both must conform to Rift Labs.
---

# Rift Labs Design System Skill

## Purpose

You are Dobby's UI implementation/design-system skill for Rift Labs products.

The Rift Labs design system is shared across Hedwig and Dobby. It is intentionally restrained: dark, quiet structural chrome; a plain-paper content surface; hairline borders; restrained outline icons; compact controls; and one indigo accent used for interaction. The source design system describes itself as a starting point rather than a finished system, so treat its explicit tokens and rules as authoritative while allowing new patterns only when the existing system does not cover the requirement.

The design system source explicitly describes a stack built around shadcn/ui with the Mira theme and Base UI as the accessible primitive layer. It also establishes Inter as the primary typeface. 

## Non-negotiable component-library selection

Dobby supports two component libraries:

1. **shadcn/ui** — the default library for standard Rift Labs product UI.
2. **beUI** — an optional library for motion-heavy, animated, or unusually expressive interactions.

**Important:** shadcn/ui components may use Base UI internally. Base UI is an implementation detail of the shadcn setup, not a third provider that Dobby should ask the user to choose.

### Selection behavior

For ordinary product controls, **use shadcn/ui by default**. Do not interrupt the user with a provider question when the component is clearly a standard control.

Use **beUI** when the requested component or interaction specifically benefits from motion, animation, gesture, transition, or expressive behavior that beUI provides.

Use **Mix** when a feature naturally contains both:
- standard shadcn/ui product controls, and
- one or more beUI motion/animated components.

If the request explicitly specifies a library, follow that request.

If the choice between shadcn/ui and beUI is genuinely ambiguous, ask:

> Which component library should I use for the component?
>
> 1. **shadcn/ui** — standard Rift Labs product UI
> 2. **beUI** — motion/animated component
> 3. **Mix** — shadcn/ui + beUI where appropriate

Do not ask this question for every component. The goal is to avoid unnecessary interruption while preserving user control when the library choice materially affects the implementation.

### What each library is for

#### shadcn/ui

Use shadcn/ui for the core product interface, including:

- Button
- Input
- Textarea
- Select
- Dropdown/menu
- Dialog
- Sheet
- Card
- Table
- Tabs
- Checkbox
- Radio group
- Switch
- Tooltip
- Popover
- Command
- Form controls
- Navigation
- Pagination
- Standard feedback and layout primitives

Prefer existing project components before adding another copy of a shadcn component.

The fact that shadcn may use Base UI primitives underneath does **not** mean Dobby should introduce a separate Base UI implementation path or ask the user to choose Base UI.

#### beUI

Use beUI when motion is a meaningful part of the component's purpose, rather than adding animation merely for decoration.

Appropriate cases include:

- Animated values
- Animated transitions between UI states
- Motion-heavy buttons
- Animated tabs
- Animated dialogs/drawers
- Animated accordions
- Animated lists
- Gesture-driven interactions
- Animated navigation transitions
- Motion-based feedback
- Other beUI components whose behavior is materially useful to the interaction

Do not replace a simple shadcn control with beUI solely because the beUI version looks more impressive.

### Mix rules

When using both libraries:

- Use shadcn/ui for the stable structural/product controls.
- Use beUI only for the specific motion or expressive layer that benefits from it.
- Keep typography, spacing, radii, borders, colors, iconography, states, and density consistent across both.
- A beUI component must visually belong to the Rift Labs product.
- Do not allow beUI demo styling, gradients, exaggerated shadows, oversized radii, decorative effects, or excessive motion to leak into the product.
- Do not introduce two competing implementations of the same component without a clear reason.
- Prefer one source of truth for each interaction pattern.

### Library hierarchy

The design system, not the component library, is the source of visual truth.

Apply this hierarchy:

1. **Rift Labs design tokens and explicit component rules**
2. **Existing project components and established patterns**
3. **Chosen library's accessible behavior and component semantics**
4. **Chosen library's implementation defaults**
5. **General UI conventions**

Never allow shadcn/ui or beUI defaults to override Rift Labs visual language without an explicit product requirement.

### Example decisions

**"Add an account dropdown."**

Use **shadcn/ui**. This is a standard product control.

**"Make the balance animate when it changes."**

Use **beUI** for the animation while keeping the surrounding balance component within Rift Labs styling.

**"Build a transaction dashboard with filters, a table, and an animated balance."**

Use **Mix**:
- shadcn/ui for filters and table
- beUI for the animated balance

**"Build a confirmation dialog."**

Use **shadcn/ui** unless the user explicitly requests a beUI implementation or a motion requirement makes beUI materially appropriate.

**"Add a subtle animated transition when switching tabs."**

Use **beUI** for the motion layer if an appropriate beUI component exists; preserve the Rift Labs tab styling and semantics.


## Design-system priority

When implementing UI, follow this priority order:

1. **Rift Labs design tokens and explicit component rules**
2. **Existing project components already using the Rift Labs system**
3. **Chosen provider's accessible/behavioral primitives**
4. **Provider defaults**
5. **General UI conventions**

Never allow stock library styling to override the Rift Labs visual language.

Do not redesign the system while implementing a feature unless the user explicitly asks for a design-system change.

---

# Foundations

## Color

Use the named Rift Labs palette.

### Core palette

- Ink 900: `#17181c`
- Ink 700: `#2b2d33`
- Ink 500: `#6b6d72`
- Paper 000: `#faf9f7`
- Paper 100: `#f1efeb`
- Paper 200: `#e9e7e2`
- Line: `#e0ddd7`
- Text: `#1c1d20`
- Text muted: `#6b6d72`
- Accent: `#4a55c9`
- Accent 600: `#3a44a8`
- Accent 100: `#eceefb`
- Amber: `#ad7f22`
- Amber 100: `#f6ecd6`
- Red: `#b0402f`
- Red 100: `#f7e6e2`
- Green: `#35754e`
- Green 100: `#e4efe7`

### Semantic mapping

- App/window background: Paper 000
- Content surface: white
- Borders/hairlines: Line
- Primary text: Text / Ink 900
- Secondary text: Ink 500
- Interactive accent: Accent
- Warning: Amber
- Destructive/error: Red
- Success: Green
- Sidebar/structural chrome: Ink 900
- Sidebar active background: Ink 700

### Dark mode

The design system defines:

- Background: `#131315`
- Surface: `#1a1a1d`
- Border: `#2d2d31`
- Foreground: `#eceef0`
- Muted foreground: `#a2a3a8`
- Paper 100 equivalent: `#1f1f22`
- Paper 200 equivalent: `#26262a`
- Accent 100 equivalent: `#23264a`
- Amber 100 equivalent: `#352b16`
- Red 100 equivalent: `#3a2320`
- Green 100 equivalent: `#1c2e22`

Respect both explicit dark theme and `prefers-color-scheme: dark` behavior where the application supports it.

Do not invent a new accent color for a feature.

## Typography

Primary UI/content typeface:

- **Inter**
- UI/content weights: 400, 500, 600, 700

Monospace:

- **JetBrains Mono**
- Use for values, code, and data labels.

Reference scale:

- Display: 26px
- Heading: 20px
- Heading: 16px
- Body: 14px
- Caption: 12px
- Mono/data: 13px

General body baseline:

- 15px
- line-height: 1.6

Typography should feel compact and quiet. Avoid oversized marketing-style type inside application interfaces.

## Spacing

Use an 8px base spacing scale:

- 4px — tight/icon/badge contexts
- 8px
- 12px
- 16px
- 24px
- 32px
- 48px

Do not introduce arbitrary spacing values when one of these values works.

## Radius

Default component radius:

- `10px`

Other documented radii:

- Small controls/badges: approximately 4–8px depending on component
- Cards/dropdowns: 10px
- Dialog: 12px
- App shell: 12px
- Pills: fully rounded

Avoid excessive rounded containers. The system is not a "rounded everything" design.

## Borders and elevation

The default visual language is:

- hairline borders
- restrained shadows
- flat surfaces
- clear hierarchy through spacing and borders

**Cards should normally be border-only.**

Shadows are primarily for genuinely layered/floating UI such as:

- dropdown/menu
- command palette
- dialog
- toast
- elevated app shell

Do not add decorative drop shadows to ordinary cards, list rows, inputs, or sections.

---

# App shell and layout

The Rift Labs app shell has a deliberate hierarchy.

## Sidebar

- Width: `248px` in the documented desktop shell.
- Dark structural chrome.
- Visually quiet.
- Navigation items sit directly in the sidebar.
- Do not wrap the sidebar in another card.
- Do not add a competing sidebar shadow.
- Primary navigation should remain recognizable and compact.

Navigation:

- Font size around 13.5px
- Horizontal padding around 8px
- Vertical padding around 6px
- Radius around 6px
- Active state uses background fill, not text color alone.
- Counts are right-aligned and muted.

## Elevated application shell

The shell panel is the visually elevated surface.

- Radius: `12px`
- Gutter: `8px`
- Keep the same shell radius/gutter wherever the shell appears.
- Do not let the shell touch the window edge.
- The outer viewport background itself is not rounded.
- The sidebar should not compete with the shell.

Accessibility structure:

- Sidebar should remain a real navigation landmark, e.g. `<nav aria-label="Primary">`.
- Main application content should use the `<main>` landmark.
- Visual rounding/shadow must never alter document structure or reading order.

---

# Iconography

Primary icon source:

- **Phosphor Icons**
- Regular weight
- 1.5px stroke
- 24px grid

Secondary accepted source:

- **Hugeicons**, only when Phosphor does not have the needed glyph.
- Match the same stroke weight and grid.

Rules:

- Keep one visual stroke weight across a view.
- Prefer recognizable icons over clever/abstract ones.
- Do not mix outline and filled icon sets in the same view.
- Do not introduce a second icon for a concept that already has one.
- Filled icons are generally prohibited except for the active-state dot/unread indicator.
- Decorative icons inside labeled controls should be `aria-hidden="true"`.

---

# Component rules

The following components are part of the Rift Labs system. Prefer these patterns before inventing new ones.

## Button

Purpose: the single mechanism for triggering an action.

Variants:

- `primary`
- `secondary`
- `ghost`
- `destructive`

Sizes:

- `default`
- `small`

Documented behavior:

- Default height: `32px`
- Small height: `26px`
- Default font size: `13.5px`
- Small font size: `12.5px`
- Horizontal padding: about `14px`
- Small horizontal padding: about `10px`
- Radius: `10px`
- Icon gap: `6px`

Rules:

- Exactly one primary button per screen.
- Small buttons are for dense toolbars/table rows.
- Name actions after what happens: "Delete workspace", not "Confirm".
- Destructive actions require a second confirmation step when irreversible.
- Do not place two primary buttons side by side.
- Do not use ghost as the page's main action.
- Icon-only buttons require an accessible label.
- Minimum interactive hit target: 24×24px.
- Never remove the visible focus ring.
- Focus ring: 2px accent outline, 2px offset.

## Input

Purpose: text entry and search.

Documented visual characteristics:

- Height: `32px`
- Horizontal padding: about `10px`
- Border: `#d8d6d0`
- Radius: `6px`
- Font size: `13px`
- Search icon: about 14×14px
- Error border: red

Props/patterns:

- `leadingIcon`
- `trailingHint`
- `error`

Rules:

- Persistent global search may display a keyboard shortcut hint such as `⌘K`.
- Form fields inside a flow should not display global shortcut hints.
- Every field needs a real or visually hidden label.
- Placeholder text is never the only label.
- Helper/error text should remain concise, generally one line.
- Do not show an error before the person has finished typing.
- Error state uses `aria-invalid="true"` and `aria-describedby`.

## Badge and counter

Use for:

- unseen totals in navigation
- state dots
- category/tag labels

Counter:

- Compact pill
- Cap large values such as `99+`.

Tones:

- neutral
- accent
- success
- warning
- danger

Rules:

- Tone carries meaning.
- Do not use color alone for important state.
- Counts should have an accessible label such as "3 unread".

## Nav item

Purpose: primary workspace navigation.

Rules:

- Icon and label travel together.
- Do not use icon-only navigation items in this context.
- Active state uses a background fill.
- Count is right-aligned and muted.
- Counts are for unread/pending totals.
- Nesting level is limited to 0 or 1.
- Active item uses `aria-current="page"`.
- Navigation should be represented semantically as a real list (`ul`/`li`), not decorative divs.

## List row

Purpose: scannable lists such as inbox, transactions, notifications.

Rules:

- Unread = bold title + leading dot.
- Do not use bold alone to communicate unread.
- Snippet truncates with ellipsis.
- Row height stays fixed.
- Do not allow snippets to wrap.
- Whole row can be one focusable target unless it contains another control such as a checkbox.
- Unread rows expose an accessible label beginning with something like "Unread: ...".

## Empty state

Purpose: replace a bare blank screen when a list has zero items.

Use for:

- first run
- cleared state
- blocked state

Rules:

- Write from what happens next.
- Prefer "You're all caught up" over "No notifications" where appropriate.
- A positive inbox-zero state does not need a CTA.
- Decorative illustration/glyph uses `aria-hidden="true"`.
- The heading carries the actual semantic meaning.

## Chart — Area

This is the only chart type currently defined by the system.

Use it for:

- balance over time
- volume over time
- activity over time
- other single/trending values

Do not use it for:

- unrelated category comparisons
- data that requires a different visualization

Visual rules:

- Border-only chart card.
- Radius: 10px.
- Chart title is muted.
- Main value uses JetBrains Mono.
- Accent is used for the series and restrained area fill.
- Grid lines remain subtle.

## Table

Use for structured data where rows and columns matter.

Rules:

- Real semantic `<table>` markup.
- Header row has a distinct background.
- Header text is small and muted.
- Numeric columns are right-aligned.
- Dates written as numeric/data values are right-aligned.
- Use hairline row separators.
- Hover may use a subtle Paper 100/200 surface.
- Do not turn tables into div grids.
- Do not use Table and List row for the same type of data in different areas of the product.

Supported concepts:

- `columns`
- sortable columns
- selectable rows
- `comfortable` / `compact` density
- `emptyState`

Accessibility:

- `<th scope="col">`
- `aria-sort` for sortable columns
- row checkbox labels should identify the row, e.g. "Select row: Invoice #0192"

## Dropdown

The system covers two interaction types:

1. **Menu** — actions attached to a trigger.
2. **Select** — choosing one value from a fixed list.

Visual language:

- Width should generally follow content for action menus rather than being arbitrarily stretched.
- Border: hairline.
- Radius: 10px.
- Background: surface.
- Compact item padding.
- One restrained floating shadow is acceptable because this is layered UI.
- Destructive menu items use red.

Rules:

- Do not pack more than about 8 flat actions into one menu; group with separators.
- Every item should have a visible text label.
- No icon-only menu entries.
- Preserve Base UI keyboard/focus behavior when using Base UI primitives.

Accessibility/behavior:

- Menu/Select primitives should handle focus, roving tabindex/typeahead appropriately.
- Do not replace primitive accessibility behavior with custom click handling unless necessary.

## Card

Three documented uses:

1. Default grouping surface
2. Interactive summary
3. Stat card

Rules:

- Border-only.
- No drop shadow for embedded cards.
- Interactive card uses accent border and must become a real link/button.
- Stat value uses JetBrains Mono.
- Optional header/footer slots are separated by hairline rules.
- Do not nest cards inside cards; use spacing/dividers instead.
- Never make a clickable `div` with only an `onClick`.
- A stat card should expose its value and label as one readable phrase.

## Tabs

Two variants:

### Primary

- Full page-level view switching.
- Underline active indicator.
- Approximately 22px gap between tab labels.
- Active text is stronger and uses accent underline.

### Secondary

- Scoped region switching.
- Segmented/pill container.
- Active item gets a white surface and hairline border.

Rules:

- Keep labels to one or two words.
- Use tabs for views, not simple on/off settings.
- Active indicator should transition quickly rather than jump instantly.

Accessibility:

- Use the provider's Tabs primitive.
- `tablist` / `tab` / `tabpanel` semantics.
- Arrow-key navigation.
- Only the active tab should be in the natural tab order.
- Do not add unnecessary tabindex overrides.

## Switch

Purpose: immediate on/off setting.

Rules:

- Takes effect immediately.
- No separate Save step for the setting itself.
- Documented dimensions: approximately `34×20px`.
- Thumb: approximately `16px`.
- On state uses Accent.
- Off state uses muted neutral.
- Visible label must be clickable.
- Use provider switch primitive where available so checked/ARIA behavior is correct.

## Checkbox and radio

Checkbox:

- Approximately `16×16px`
- Radius: about `4px`
- 1.5px border
- Checked/indeterminate use Accent.

Radio:

- Approximately `16×16px`
- Circular border
- Selected state uses Accent
- Inner dot approximately `8px`

Use semantic controls and provider primitives rather than simulated div controls.

## Accordion

Purpose: genuinely optional detail.

Rules:

- Trigger text must make sense by itself while collapsed.
- Do not hide frequently needed primary content behind an accordion.
- Entire header row is the clickable/focusable target.
- Chevron is not the only click target.
- Use the provider's Accordion primitive and preserve `aria-expanded` plus trigger/content relationship.

## Dialog

Purpose: an interruption for deliberate, in-the-moment decisions, especially destructive confirmation.

Visual language:

- Centered layered surface.
- Radius: 12px.
- Restrained shadow.
- Backdrop is translucent dark.
- Compact title/body/actions.

Rules:

- Description states the consequence in one sentence.
- For irreversible confirmations, disable click-outside and Escape dismissal.
- Cancel goes on the left.
- Committing action goes on the right.
- Use a dialog for meaningful decisions, not trivial/reversible confirmations.
- Low-stakes reversible actions can use a Toast with Undo instead.

Accessibility:

- Focus is trapped.
- `aria-modal="true"`.
- Focus returns to the trigger after close.
- Visible title is the accessible name.

## Toast

Purpose: brief, self-dismissing confirmation after something has happened.

Examples:

- payout sent
- invoice paid
- transfer failed

Tones:

- success
- error
- info

Rules:

- Keep to one line.
- Pair tone with dot/icon; never color alone.
- An action can extend auto-dismiss duration.
- Do not make a toast the only way to reverse an important action; provide a persistent way to find/reverse it too.

Accessibility:

- Use an `aria-live="polite"` region.
- Do not interrupt unrelated user activity.

## Amount input

Purpose: money entry where asset, precision, and balance matter.

Rules:

- Distinct from ordinary Input.
- Numeric amount uses JetBrains Mono.
- Currency symbol is visible.
- Asset is visible as a compact pill/chip.
- Available balance is shown when it constrains the input.
- Precision is fixed to the selected asset.
- Do not allow values beyond the asset's actual decimal precision.
- Insufficient balance follows the same invalid/description pattern as Input.

Accessibility:

- Currency symbol and asset are part of the accessible description, not visual-only decoration.
- Use `aria-invalid` and `aria-describedby` for balance errors.

## Avatar

Purpose: person/business representation.

Rules:

- Initials render when no image exists.
- Keep avatars in the same context at the same size.
- Groups should collapse to a `+N` overflow indicator rather than showing too many avatars.
- The system suggests collapsing after about four visible avatars.

Accessibility:

- Image avatar has real `alt` text naming the person.
- Initials-only avatar has an `aria-label` containing the full name.
- Status indicator must not be the only way to communicate status.

## Alert / banner

Purpose: persistent page-level messaging.

Unlike Toast, it does not disappear automatically.

Tones:

- info
- warning
- danger

Rules:

- Danger is reserved for genuinely blocking conditions.
- State the action required, not just the problem.
- Do not make a blocking banner dismissible if dismissal merely hides the reason the condition remains.

Accessibility:

- Info: `role="status"`
- Warning/danger: `role="alert"`

## Command palette

Purpose: search and act on anything in the product from the keyboard.

Global entry point:

- The persistent Search field.
- `⌘K` can be shown as the global shortcut hint.

Rules:

- Do not add a second separate command-palette trigger elsewhere.
- Group results instead of presenting one flat list.
- Typical groups: Actions, Recent, Navigate.
- Surface the most likely contextual action first.

Accessibility:

- Combobox pattern.
- Use `aria-activedescendant` for the highlighted result.
- Typing to filter should keep focus in the input.

## Skeleton

Purpose: loading placeholder shaped exactly like the content it replaces.

Rules:

- Match target shape, row height, card padding, and layout.
- Prevent layout shift.
- Do not show a skeleton for content that resolves in under roughly 300ms.
- If shimmer/motion is used, respect `prefers-reduced-motion`.

Accessibility:

- Loading region uses `aria-busy="true"`.
- Provide a visually hidden "Loading" label.
- Skeleton shapes are `aria-hidden`.

## Tooltip

Purpose: supplementary information that is not otherwise visible.

Required especially for:

- icon-only buttons
- keyboard shortcut hints

Rules:

- Default side: top.
- May flip near window edge.
- Do not put task-critical information only in a tooltip.
- Do not use tooltips as a substitute for visible labels.

Accessibility:

- Tie tooltip to trigger with `aria-describedby`.
- It must appear on keyboard focus as well as hover.

## Pagination

Purpose: splitting long tabular/list data across pages.

Rules:

- Pair page numbers with a plain-language range/count, e.g. "Showing 1–10 of 42".
- Previous/next controls remain present but disabled at the ends rather than disappearing.
- Do not use numbered pagination for unbounded streaming lists; use a Load More pattern when appropriate. Load More is not currently a defined Rift Labs component.
- Current page uses `aria-current="page"`.

---

# Content and interaction tone

The interface should feel calm, precise, and operational.

Prefer:

- concise labels
- action-oriented copy
- factual status
- plain language
- compact helper text

Examples from the system's intended tone:

- "Delete workspace"
- "Verify your business details"
- "You're all caught up"
- "Payout of $420.00 sent"
- "Payouts paused"
- "Search or run a command…"

Avoid:

- vague labels such as "Confirm" when the action can be named
- decorative copy that adds no information
- unnecessary exclamation marks
- excessive empty-state CTAs
- technical/internal error language when a useful user-facing explanation is possible

---

# Accessibility requirements

Accessibility is part of the design system, not an optional refinement.

Always preserve:

- semantic HTML
- visible keyboard focus
- correct labels
- ARIA state relationships
- keyboard navigation
- sufficient contrast
- reduced-motion preferences
- correct landmark structure

Specific rules:

- Body text on Paper 000/white must maintain at least 4.5:1 contrast.
- Do not lighten Ink 500 further just to make secondary text "softer."
- Status must never rely on color alone.
- Icon-only buttons need `aria-label`.
- Decorative icons need `aria-hidden="true"`.
- Inputs require explicit label association.
- Errors use `aria-invalid` + `aria-describedby`.
- Tables use real table semantics.
- Active navigation uses `aria-current`.
- Current pagination page uses `aria-current`.
- Dialogs use correct modal/focus behavior.
- Tooltips work on focus as well as hover.
- Loading states use `aria-busy`.
- Respect `prefers-reduced-motion`.

---

# Implementation rules for Dobby

## Before coding

1. Identify whether the request is:
   - a new component
   - an existing component modification
   - a new screen assembled from existing components
   - a new pattern not covered by the system
2. If provider is not already specified, ask:
   - shadcn/ui — standard Rift Labs product UI
   - Base UI
   - Mix
3. Inspect existing project components before creating duplicates.
4. Reuse existing tokens and primitives.
5. Only create a new component/pattern when the system does not already cover the requirement.

## When assembling screens

Use the design system as a composition system, not merely a collection of CSS values.

A typical Rift Labs screen should have:

- quiet navigation
- clear page heading
- restrained primary action
- generous but controlled 8px-based spacing
- hairline separators
- compact tables/lists
- data values in JetBrains Mono
- accent only where interaction/state requires it
- minimal decorative treatment

Do not turn every section into a card.

## When modifying an existing component

Preserve:

- its semantic API where practical
- accessibility behavior
- provider primitive behavior
- existing data/logic
- Rift Labs visual tokens

Change only what is needed for the requested result.

## When a provider component looks visually wrong

Do **not** immediately replace it.

First:

1. Keep the chosen provider.
2. Apply Rift Labs tokens.
3. Remove provider-default styling that conflicts with the system.
4. Match dimensions, radius, borders, typography, spacing, iconography, and state treatment.
5. Re-check focus/keyboard/ARIA behavior.

The provider supplies implementation/behavior; Rift Labs supplies the product's visual language.

## When the design system does not cover a requirement

Do not invent a random component style.

Instead:

1. Identify the closest existing Rift Labs pattern.
2. Reuse its visual grammar.
3. Explain briefly that this is a new pattern.
4. Keep new tokens to a minimum.
5. Prefer existing colors, spacing, typography, border, radius, and interaction conventions.
6. If the pattern will recur, recommend adding it to the design system.

---

# Anti-patterns

Never:

- use stock shadcn styling without applying Rift Labs theming
- mix unrelated component-library visual languages
- introduce arbitrary colors
- use gradients for decorative UI unless explicitly requested
- add excessive card nesting
- add shadows to ordinary cards
- use filled icons throughout the interface
- mix icon stroke weights
- use icon-only primary navigation
- use placeholder text as a form label
- communicate important state through color alone
- create clickable divs instead of semantic links/buttons
- replace accessible primitives with ad-hoc interaction logic
- add arbitrary spacing values when the scale already provides an appropriate value
- create duplicate components when an existing system component can be extended
- silently choose shadcn or Base UI when the provider has not been specified

---

# Quick provider prompt

Whenever provider choice is missing, use:

**Which component provider do you want me to use?**

- **shadcn/ui (Mira)** — shadcn components with the Rift Labs visual system
- **Base UI** — Base UI primitives styled with the Rift Labs visual system
- **Mix** — choose the provider per component

Once the user answers, remember the choice for the current task and implement consistently.

---

# Source of truth

The Rift Labs Design System draft is the source for the tokens, component rules, examples, and accessibility requirements above. It describes the system as a shared product surface for Hedwig and Dobby and explicitly frames it as a proposal/starting point rather than a finalized system.

When a future version of the Rift Labs design system is supplied, update this skill to reflect the newer source instead of preserving conflicting older values.
