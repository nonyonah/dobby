/**
 * Named colours, so a colour is never communicated as a bare hex.
 *
 * Every entry is dark enough to keep white text above 4.5:1, which is what lets
 * chips and dots share one palette. `colorName` is the reverse lookup used
 * wherever a stored hex has to be shown back to a person.
 */

export interface NamedColor {
  hex: string;
  name: string;
}

export const NAMED_COLORS: NamedColor[] = [
  { hex: "#4a55c9", name: "Indigo" },
  { hex: "#0f766e", name: "Teal" },
  { hex: "#1d4ed8", name: "Blue" },
  { hex: "#be123c", name: "Crimson" },
  { hex: "#7c3aed", name: "Violet" },
  { hex: "#0e7490", name: "Cyan" },
  { hex: "#a16207", name: "Amber" },
  { hex: "#15803d", name: "Green" },
  { hex: "#c2410c", name: "Orange" },
  { hex: "#4338ca", name: "Blue-violet" },
  { hex: "#9d174d", name: "Magenta" },
  { hex: "#065f46", name: "Forest" },
  { hex: "#92400e", name: "Rust" },
  { hex: "#1e3a8a", name: "Navy" },
  { hex: "#86198f", name: "Purple" },
  { hex: "#155e75", name: "Deep teal" },
  { hex: "#3f6212", name: "Olive" },
  { hex: "#831843", name: "Berry" },
];

/** Human name for a hex, or "Custom" when it isn't one of ours. */
export function colorName(hex: string | null | undefined): string {
  if (!hex) return "Automatic";
  const match = NAMED_COLORS.find((entry) => entry.hex.toLowerCase() === hex.toLowerCase());
  return match ? match.name : "Custom";
}

export function isNamedColor(hex: string): boolean {
  return NAMED_COLORS.some((entry) => entry.hex.toLowerCase() === hex.toLowerCase());
}
