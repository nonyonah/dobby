"use client";

import { useEffect } from "react";

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
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  return null;
}
