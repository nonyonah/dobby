import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { radius, tokens } from "./tokens.js";

/**
 * The email palette is a copy of the app's, and a copy is only useful while
 * somebody checks it.
 *
 * These were hand-copied and then silently left behind when the app moved from
 * the purple brand to the monochrome one, so every email had been sending in
 * colours the product no longer used — for months, with nothing failing. This
 * parses the real `globals.css` and compares, so the next time a designer moves
 * the palette this fails the build instead of the brand.
 */

const here = dirname(fileURLToPath(import.meta.url));
const globalsCss = readFileSync(resolve(here, "../../../web/app/globals.css"), "utf8");

/**
 * Every `--name: value` in a slice, last definition winning.
 *
 * Last-wins matches the cascade inside one scope. It is only safe because the
 * two scopes are read separately: the `.dark` block redeclares every variable,
 * so reading the whole file would hand back dark values for the light scheme.
 */
function declarations(source: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of source.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    found.set(match[1]!, match[2]!.trim());
  }
  return found;
}

// The light theme is everything before `.dark`, the dark theme everything from
// it on. `--paper-*` and `--text` are shared by both and are deliberately not
// redeclared for dark, which the dark expectations below would catch.
/** Case-insensitive lookup, because the app mixes `#F9F9FA` and `#f9f9fa`. */
const lightVar = (name: string) => all.get(name)?.toLowerCase();
const darkVar = (name: string) => dark.get(name)?.toLowerCase();

const darkStart = globalsCss.search(/^\s*\.dark\b/m);
const all = declarations(globalsCss.slice(0, darkStart === -1 ? globalsCss.length : darkStart));
const dark = declarations(globalsCss.slice(darkStart === -1 ? 0 : darkStart));

/**
 * Alpha colours are not usable in a `border` attribute — Outlook and Gmail on
 * Windows drop them — so the emails carry the nearest opaque equivalent. This
 * records where each one came from rather than leaving it a mystery value.
 */
const OPAQUE_EQUIVALENTS: Array<{ scheme: "light" | "dark"; token: string; appVar: string }> = [
  { scheme: "light", token: "line", appVar: "paper-200" },
  { scheme: "dark", token: "line", appVar: "paper-200" },
];

describe("email tokens match the app", () => {
  it("has the primary surface and its foreground for both schemes", () => {
    expect(tokens.light.accent.toLowerCase()).toBe(lightVar("primary"));
    expect(tokens.light.accentForeground.toLowerCase()).toBe(lightVar("primary-foreground"));

    expect(darkVar("primary")!.toLowerCase()).toBe(tokens.dark.accent);
    expect(darkVar("primary-foreground")!.toLowerCase()).toBe(tokens.dark.accentForeground);
  });

  it("has the surfaces both schemes are built on", () => {
    expect(tokens.light.surface.toLowerCase()).toBe(lightVar("surface"));
    expect(tokens.light.background.toLowerCase()).toBe(lightVar("paper-000"));
    expect(tokens.dark.surface.toLowerCase()).toBe(darkVar("surface"));
    expect(tokens.dark.background.toLowerCase()).toBe(darkVar("paper-000"));
  });

  it("has the text pair both schemes are written in", () => {
    expect(tokens.light.text.toLowerCase()).toBe(lightVar("text"));
    expect(tokens.light.textMuted.toLowerCase()).toBe(lightVar("text-muted"));
    expect(tokens.dark.text.toLowerCase()).toBe(darkVar("text"));
    expect(tokens.dark.textMuted.toLowerCase()).toBe(darkVar("text-muted"));
  });

  it("has the danger colour both schemes use", () => {
    expect(tokens.light.danger.toLowerCase()).toBe(lightVar("red"));
    expect(tokens.dark.danger.toLowerCase()).toBe(darkVar("red"));
  });

  it("keeps the hairline on the app's own surface step", () => {
    // The app declares the border as alpha; the emails cannot use alpha, so the
    // substitute is the paper step it visually sits on. If that step is renamed
    // this is the test that says so.
    for (const { scheme, token, appVar } of OPAQUE_EQUIVALENTS) {
      const value = tokens[scheme];
      const app = scheme === "light" ? lightVar(appVar) : darkVar(appVar);
      expect(value[token as keyof typeof value].toLowerCase()).toBe(app);
    }
  });

  it("has a card radius the app also uses", () => {
    expect(radius.card).toBe(lightVar("radius-2xl"));
  });

  it("does not still carry the retired purple brand", () => {
    // The value that was wrong for months. Asserted explicitly so that a
    // re-introduction is a deliberate act rather than a copy-paste from history.
    expect([tokens.light.accent, tokens.dark.accent].map((c) => c.toLowerCase())).not.toContain("#411880");
    expect([tokens.light.accent, tokens.dark.accent].map((c) => c.toLowerCase())).not.toContain("#a77cff");
  });
});