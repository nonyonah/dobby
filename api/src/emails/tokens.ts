/**
 * Email palette, taken from the app's own tokens in `web/app/globals.css`.
 *
 * These were hand-copied and left behind when the app moved from the purple
 * brand to the near-black/near-white monochrome, so every email had been
 * rendering in colours the product no longer uses. The mapping below names the
 * app variable each value comes from, and `tokens.test.ts` parses
 * `globals.css` and fails if any of these drift from it — which is the only
 * thing that stops the copy rotting a second time.
 *
 * The app has no accent. What the design system calls its primary surface is
 * `--primary`, so that is what the CTA paints: near-black in light, near-white in
 * dark, with the foreground inverted to match.
 *
 * The two deliberate departures from the app, both for email rather than screen:
 *
 *   - the CTA is a 50px pill, not the app's 10px control radius. A button in an
 *     email is read at a glance in a notification list, where the pill is
 *     recognisable as an action at far more sizes than a 10px radius is;
 *   - borders are resolved to a flat value instead of `rgb(0 0 0 / 0.08)`, because
 *     alpha in a border attribute is dropped by Outlook and Gmail on Windows.
 *     `line` is the nearest opaque equivalent of the app's hairline.
 *
 * oklch values are converted to hex for the same reason: email clients have no
 * oklch support, and a colour that silently falls back to black in Outlook is
 * worse than a slightly different shade.
 */

export const tokens = {
  light: {
    /** `--primary` / `--primary-foreground`. */
    accent: "#232528",
    accentForeground: "#ffffff",
    /** `--surface` */
    surface: "#ffffff",
    /** `--paper-000` */
    background: "#f9f9fa",
    /** Nearest opaque form of `--border`, which is `rgb(0 0 0 / 0.08)`. */
    line: "#e8eaed",
    /** `--text` */
    text: "#232528",
    /** `--text-muted` */
    textMuted: "#6b6d72",
    /** `--success-foreground` */
    success: "#007a55",
    /** `--warning` */
    warning: "#bb4d00",
    /** `--danger` */
    danger: "#e11d48",
  },
  dark: {
    accent: "#e5e6e8",
    accentForeground: "#232528",
    surface: "#1a1a1b",
    background: "#121213",
    /** Nearest opaque form of `--border`, which is `rgb(255 255 255 / 0.06)`. */
    line: "#252529",
    text: "#e5e6e8",
    textMuted: "#a2a3a8",
    success: "#34d399",
    warning: "#fbbf24",
    danger: "#fb7185",
  },
} as const;

export type Tone = "accent" | "success" | "warning" | "danger";

/**
 * Cards are `rounded-2xl` in the app (`--radius-2xl: 16px`). Controls are a
 * pill — see the note at the top of this file for why that one differs.
 */
export const radius = { card: "16px", control: "50px" } as const;

export const spacing = { page: "32px", card: "28px", section: "16px" } as const;

/**
 * Inter throughout, like the app: it sets `--font-mono` to Inter as well.
 *
 * Figures get tabular numerals rather than a mono face, which is how the app
 * keeps a column of amounts aligned on the decimal.
 */
export const fonts = {
  sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  mono: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

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