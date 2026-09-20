"use client";

import { useEffect } from "react";
import { ACCENT_COLORS, ACCENT_STORAGE_KEY, DEFAULT_ACCENT, applyAccentColor } from "@/lib/theme";

/**
 * Mirrors the OS color scheme onto the `.dark` class so HeroUI components
 * (which use a class-based dark strategy) follow the system theme, just
 * like our media-query `dark:` utilities already do.
 */
export function ThemeSync() {
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.classList.toggle("dark", query.matches);
    };
    apply();
    const storedAccent = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    const accent = ACCENT_COLORS.some((entry) => entry.id === storedAccent) ? storedAccent : DEFAULT_ACCENT;
    applyAccentColor(accent as typeof DEFAULT_ACCENT);
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  return null;
}
