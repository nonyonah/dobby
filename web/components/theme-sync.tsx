"use client";

import { useEffect } from "react";
import { ACCENT_STORAGE_KEY, applyTheme, readStoredTheme, type ThemePreference } from "@/lib/theme";

/**
 * Owns the theme class on <html>.
 *
 * Dark mode is class-driven (see the `@custom-variant` in globals.css), so the
 * Theme setting genuinely takes effect here rather than only being persisted.
 * The root layout's inline script already set the class before first paint;
 * this component keeps it correct afterwards by re-applying on OS changes and
 * on Settings updates.
 *
 * The accent is re-applied alongside the theme because its derived shades are
 * computed light- or dark-aware.
 */
export function ThemeSync() {
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");

    /** The first application is skipped: the inline script already set it. */
    let first = true;
    const sync = () => {
      const preference = readStoredTheme() ?? "system";
      applyTheme(preference, { animate: !first });
      first = false;
    };

    sync();

    // Only meaningful while following the OS, but harmless otherwise: the
    // preference is re-read each time, so a stored Light/Dark still wins.
    query.addEventListener("change", sync);

    const onThemeChange = () => sync();
    window.addEventListener("dobby-theme-change", onThemeChange);

    // Another tab changing the accent shouldn't leave this one stale.
    const onStorage = (event: StorageEvent) => {
      if (event.key === ACCENT_STORAGE_KEY) applyTheme(readStoredTheme() ?? "system", { animate: false });
      if (event.key === "dobby-theme") sync();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      query.removeEventListener("change", sync);
      window.removeEventListener("dobby-theme-change", onThemeChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return null;
}

export type { ThemePreference };
