"use client";

import { useEffect } from "react";
import {
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  applyAccentColor,
  applyTheme,
  readStoredAccent,
  readStoredTheme,
} from "@/lib/theme";

/**
 * Keeps the theme and accent in step with storage, the OS, and other tabs.
 *
 * The no-flash script in the root layout has already stamped the correct
 * class before first paint; this runs afterwards and covers the cases CSS
 * cannot:
 *
 * - the OS switching to dark while a `system` visitor is mid-session, which
 *   has no CSS equivalent because dark is class-driven rather than a
 *   `prefers-color-scheme` query;
 * - another tab changing the theme or accent;
 * - a `dobby-theme-change` dispatched by `setTheme`.
 *
 * Theme and accent live together because the accent's shades are derived from
 * whether `.dark` is on — applying one without the other leaves tints from the
 * previous mode behind.
 */
export function ThemeSync() {
  useEffect(() => {
    const applyStored = () => applyTheme(readStoredTheme() ?? "system");

    applyStored();
    applyAccentColor(readStoredAccent() ?? DEFAULT_ACCENT);

    // Only meaningful while following the OS, but re-applying is cheap and
    // keeps this branch-free when the preference changes mid-session.
    const media = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    const onSystemChange = () => applyStored();
    media?.addEventListener("change", onSystemChange);

    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) applyStored();
      if (event.key === ACCENT_STORAGE_KEY) applyAccentColor(readStoredAccent() ?? DEFAULT_ACCENT);
    };
    window.addEventListener("storage", onStorage);

    const onThemeChange = () => applyStored();
    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);

    return () => {
      media?.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
    };
  }, []);

  return null;
}