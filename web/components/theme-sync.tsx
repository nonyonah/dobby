"use client";

import { useEffect } from "react";
import { ACCENT_COLORS, ACCENT_STORAGE_KEY, DEFAULT_ACCENT, applyAccentColor } from "@/lib/theme";

/**
 * Mirrors the OS color scheme onto the `.dark` class so HeroUI components
 * (which use a class-based dark strategy) follow the system theme, just
 * like our media-query `dark:` utilities already do.
 *
 * The accent is re-applied after every theme flip: its derived shades
 * (hover, tints) are computed light- or dark-aware, so they must be
 * recalculated when the scheme changes.
 */
export function ThemeSync() {
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const readAccent = () => {
      const stored = window.localStorage.getItem(ACCENT_STORAGE_KEY);
      const accent = ACCENT_COLORS.some((entry) => entry.id === stored) ? stored : DEFAULT_ACCENT;
      return accent as typeof DEFAULT_ACCENT;
    };
    const apply = () => {
      document.documentElement.classList.toggle("dark", query.matches);
      applyAccentColor(readAccent());
    };
    apply();
    query.addEventListener("change", apply);
    const onStorage = (event: StorageEvent) => {
      if (event.key === ACCENT_STORAGE_KEY) applyAccentColor(readAccent());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      query.removeEventListener("change", apply);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return null;
}
