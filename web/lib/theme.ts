export type AccentColor = "brand" | "graphite" | "green" | "blue" | "violet" | "orange" | "rose" | "amber";

export const ACCENT_COLORS: Array<{ id: AccentColor; label: string; value: string }> = [
  { id: "brand", label: "Brand", value: "#411880" },
  { id: "graphite", label: "Graphite", value: "#52525b" },
  { id: "green", label: "Green", value: "#00afb9" },
  { id: "blue", label: "Blue", value: "#2563eb" },
  { id: "violet", label: "Violet", value: "#7c3aed" },
  { id: "orange", label: "Orange", value: "#ea580c" },
  { id: "rose", label: "Rose", value: "#e11d48" },
  { id: "amber", label: "Amber", value: "#d97706" },
];

export const DEFAULT_ACCENT: AccentColor = "brand";
export const ACCENT_STORAGE_KEY = "dobby-accent-color";

/* -------------------------------------------------------------- theme */

/**
 * `system` follows the OS and keeps following it live; `light`/`dark` pin the
 * choice. Default is `system` so a first-time visitor on a light machine sees
 * the light palette, which is what the OS asked for.
 */
export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "dobby-theme";
/** Fired after a change so other mounted components can re-read the preference. */
export const THEME_CHANGE_EVENT = "dobby-theme-change";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

/** The stored preference, or `null` when nothing valid is stored. */
export function readStoredTheme(): ThemePreference | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Turn a preference into the palette that will actually be painted. */
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") return preference;
  return systemPrefersDark() ? "dark" : "light";
}

/**
 * The accent saved on this device, or `null` when nothing valid is stored.
 *
 * Storage holds the id rather than the hex so that repointing "brand" at a new
 * colour reaches everyone who chose Brand, including on devices that were set
 * up before the change.
 */
export function readStoredAccent(): AccentColor | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    return ACCENT_COLORS.some((entry) => entry.id === stored) ? (stored as AccentColor) : null;
  } catch {
    return null;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Mixes `hex` toward `target` by `amount` (0 = untouched, 1 = fully target). */
function mix(hex: string, target: string, amount: number): string {
  const [r1, g1, b1] = hexToRgb(hex);
  const [r2, g2, b2] = hexToRgb(target);
  return toHex(r1 + (r2 - r1) * amount, g1 + (g2 - g1) * amount, b1 + (b2 - b1) * amount);
}

const darken = (hex: string, amount: number) => mix(hex, "#000000", amount);
const lighten = (hex: string, amount: number) => mix(hex, "#ffffff", amount);

/**
 * Applies an accent everywhere the palette references it: base, hover,
 * soft/tint surfaces and their foregrounds, and the sidebar brand token.
 * Focus rings are intentionally not touched — they carry the brand-neutral
 * color and must stay put no matter which accent is picked.
 * Shades are derived from the picked color so hover never falls back to the
 * brand teal (the `:root` statics) and dark mode gets dark-safe tints.
 */
export function applyAccentColor(accent: AccentColor) {
  if (typeof document === "undefined") return;
  const color = ACCENT_COLORS.find((entry) => entry.id === accent)?.value ?? ACCENT_COLORS[0].value;
  const root = document.documentElement;
  const dark = root.classList.contains("dark");
  const set = (name: string, value: string) => root.style.setProperty(name, value);

  // Base tokens — always the accent itself.
  // `--primary` and the focus tokens (`--ring`, `--focus`,
  // `--field-border-focus`, `--sidebar-ring`) are deliberately absent: those
  // carry the brand-neutral color in globals.css, and the picker only drives
  // the decorative accent. Setting them here would win over the stylesheet and
  // pull buttons and focus rings back onto the accent.
  set("--brand", color);
  set("--sidebar-primary", color);
  set("--brand-foreground", "#ffffff");

  // Derived shades: interactive hover + tinted surfaces.
  const hover = dark ? lighten(color, 0.14) : darken(color, 0.2);
  const tint = dark ? darken(color, 0.72) : mix(color, "#ffffff", 0.82);
  const tintForeground = dark ? lighten(color, 0.35) : darken(color, 0.2);

  set("--brand-600", dark ? lighten(color, 0.18) : darken(color, 0.2));
  set("--brand-100", tint);
  set("--brand-hover", hover);
  set("--brand-soft", tint);
  set("--brand-soft-foreground", tintForeground);
  set("--brand-token", tint);
  set("--brand-token-foreground", tintForeground);
}

/**
 * Applies a theme preference to `<html>`.
 *
 * Dark is class-driven, never a `prefers-color-scheme` media query: the
 * `@custom-variant dark` in globals.css and the `.dark { … }` token block are
 * what every `dark:` utility reads, so this only has to flip that one class.
 * Adding a media query back would tie every `dark:` utility to the OS again
 * and silently break an explicit choice.
 *
 * The accent is re-applied here on purpose — its shades are derived from
 * whether `.dark` is present, so without this a light/dark switch leaves tinted
 * surfaces belonging to the mode just left behind.
 */
export function applyTheme(preference: ThemePreference, options: { animate?: boolean } = {}) {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(preference);
  const mutate = () => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    // Legacy HeroUI attribute — nothing reads it now, but the no-flash script
    // keeps it in step so nothing observing <html> sees a mismatch.
    root.dataset.theme = resolved;
    applyAccentColor(readStoredAccent() ?? DEFAULT_ACCENT);
  };
  if (options.animate === false) {
    mutate();
    return;
  }
  withoutTransitions(mutate);
}

/**
 * Persists a preference and applies it. `persist: false` applies without
 * writing, which is what the no-flash boot path and cross-tab sync want.
 */
export function setTheme(preference: ThemePreference, options: { animate?: boolean; persist?: boolean } = {}) {
  if (typeof window !== "undefined" && options.persist !== false) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // storage unavailable — the theme still applies for this page view
    }
  }
  applyTheme(preference, options);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: preference }));
  }
}

/* ------------------------------------------------------------------ misc */

/**
 * A palette swap (an accent change, or anything else that restyles nearly
 * every element at once) makes every `transition-colors` in the app fire
 * simultaneously, so the switch smears across the page instead of snapping.
 * Transitions are disabled for the duration of the swap, a reflow is forced
 * so the new values commit, and they are restored on the next frame.
 */
export function withoutTransitions(mutate: () => void) {
  const root = document.documentElement;
  const style = document.createElement("style");
  style.dataset.themeSwap = "";
  style.textContent = "*,*::before,*::after{transition:none !important}";
  root.appendChild(style);
  try {
    mutate();
    // Force a style/layout flush so the new values commit while transitions
    // are still suppressed; the next frame then restores them.
    void root.offsetHeight;
  } finally {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        style.remove();
      });
    });
  }
}
