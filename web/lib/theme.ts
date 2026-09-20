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

export function applyAccentColor(accent: AccentColor) {
  if (typeof document === "undefined") return;
  const color = ACCENT_COLORS.find((entry) => entry.id === accent)?.value ?? ACCENT_COLORS[0].value;
  const root = document.documentElement;
  root.style.setProperty("--accent", color);
  root.style.setProperty("--primary", color);
  root.style.setProperty("--ring", color);
  root.style.setProperty("--focus", color);
  root.style.setProperty("--sidebar-primary", color);
  root.style.setProperty("--field-border-focus", color);
}
