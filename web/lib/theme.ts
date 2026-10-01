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
 * soft/tint surfaces and their foregrounds, focus/ring, and sidebar tokens.
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
  set("--accent", color);
  set("--primary", color);
  set("--ring", color);
  set("--focus", color);
  set("--sidebar-primary", color);
  set("--sidebar-ring", color);
  set("--field-border-focus", color);
  set("--accent-foreground", "#ffffff");

  // Derived shades: interactive hover + tinted surfaces.
  const hover = dark ? lighten(color, 0.14) : darken(color, 0.2);
  const tint = dark ? darken(color, 0.72) : mix(color, "#ffffff", 0.82);
  const tintForeground = dark ? lighten(color, 0.35) : darken(color, 0.2);

  set("--accent-600", dark ? lighten(color, 0.18) : darken(color, 0.2));
  set("--accent-100", tint);
  set("--accent-hover", hover);
  set("--accent-soft", tint);
  set("--accent-soft-foreground", tintForeground);
  set("--accent-token", tint);
  set("--accent-token-foreground", tintForeground);
}

/* ---------------------------------------------------------------- theme */

export type ThemePreference = "system" | "light" | "dark";
export const THEME_STORAGE_KEY = "dobby-theme";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

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
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): "light" | "dark" {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return prefersDark ? "dark" : "light";
}

/**
 * A theme flip restyles nearly every element at once, so without this every
 * `transition-colors` in the app fires simultaneously and the switch smears
 * across the page instead of snapping. Transitions are disabled for the
 * duration of the swap, a reflow is forced so the new values commit, and they
 * are restored on the next frame.
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

/**
 * Applies the resolved theme plus the accent. The accent is recomputed every
 * time because its derived shades are light- or dark-aware, so they have to be
 * recalculated when the scheme changes.
 */
export function applyTheme(preference: ThemePreference, options: { animate?: boolean } = {}) {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(preference, systemPrefersDark());
  const dark = resolved === "dark";
  const apply = () => {
    const root = document.documentElement;
    root.classList.toggle("dark", dark);
    // HeroUI's stylesheet keys off [data-theme], not a class, so it needs its
    // own attribute or the tables and sidebars would stay on the OS scheme
    // while the rest of the app followed the setting.
    root.setAttribute("data-theme", resolved);
    applyAccentColor(readStoredAccent() ?? DEFAULT_ACCENT);
  };
  if (options.animate === false) {
    apply();
    return;
  }
  withoutTransitions(apply);
}

/** Notifies the app that the preference changed, so ThemeSync can react. */
export function announceThemeChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("dobby-theme-change"));
}
