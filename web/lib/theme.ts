export type AccentColor = "brand" | "graphite" | "green" | "blue" | "violet" | "orange" | "rose" | "amber";

export const ACCENT_COLORS: Array<{ id: AccentColor; label: string; value: string }> = [
  { id: "brand", label: "Brand teal", value: "#83c5be" },
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
