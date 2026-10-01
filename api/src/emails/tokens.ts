/**
 * Email palette, lifted from the app's own tokens in `web/app/globals.css`.
 *
 * Kept as one object rather than inline styles so the email cannot drift from
 * the product: the brand accent, the money semantics and the four surface
 * levels are the same values the app paints with. Dark mode overrides the same
 * custom properties in a `prefers-color-scheme` block in `layout.ts`, so there
 * is one definition per colour rather than one per usage.
 */
export const tokens = {
  light: {
    accent: "#411880",
    accentSoft: "#ddd5e8",
    accentForeground: "#ffffff",
    background: "#f4f5f6",
    surface: "#ffffff",
    surfaceMuted: "#f4f5f6",
    line: "#e3e5e8",
    text: "#1c1d20",
    textMuted: "#6b6d72",
    success: "#047857",
    warning: "#b45309",
    danger: "#e11d48",
  },
  dark: {
    accent: "#a77cff",
    accentSoft: "#120724",
    accentForeground: "#0f0e17",
    background: "#121213",
    surface: "#1a1a1b",
    surfaceMuted: "#1f1f22",
    line: "#252529",
    text: "#eceef0",
    textMuted: "#a2a3a8",
    success: "#34d399",
    warning: "#fbbf24",
    danger: "#fb7185",
  },
} as const;

export type Tone = "accent" | "success" | "warning" | "danger";

/**
 * Inter for text, JetBrains Mono for figures — the app's `--font-sans` and the
 * `.mono` class. Email clients cannot be relied on to have either, so both are
 * named first and then fall through to the platform stack. The hero number is
 * the one place the mono really shows, which is the point: it reads as a figure
 * rather than a word.
 */
export const fonts = {
  sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
} as const;

/** Cards are `rounded-2xl` in the app; controls are pills. */
export const radius = { card: "16px", control: "50px" } as const;

export const spacing = { page: "32px", card: "28px", section: "16px" } as const;

/**
 * How close a filing deadline is, which decides the visual weight.
 *
 * The same template must not look identical at 30 days and at 3: far out it
 * informs, close in it is direct. Returned as a tone plus the label the copy
 * uses, so the visual and the wording escalate together rather than the styling
 * drifting from the message.
 */
export function deadlineUrgency(daysRemaining: number): { tone: Tone; label: string } {
  if (daysRemaining <= 7) return { tone: "danger", label: "Due now" };
  if (daysRemaining <= 14) return { tone: "warning", label: "Due soon" };
  return { tone: "accent", label: "Upcoming" };
}

/** "in 3 days" / "in 12 days" / "today" — plain language, no jargon. */
export function deadlineCountdown(daysRemaining: number): string {
  if (daysRemaining <= 0) return "today";
  if (daysRemaining === 1) return "tomorrow";
  return `in ${daysRemaining} days`;
}
