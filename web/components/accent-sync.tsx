"use client";

import { useEffect } from "react";
import { ACCENT_STORAGE_KEY, DEFAULT_ACCENT, applyAccentColor, readStoredAccent } from "@/lib/theme";

/**
 * Re-applies the accent color where CSS cannot reach.
 *
 * The app is permanently dark — the `.dark` class and `data-theme="dark"`
 * are stamped onto <html> by the root layout and nothing toggles them — so
 * there is no theme preference left to sync. What still needs a client
 * component is the accent: its derived shades are computed in JS
 * (lib/theme.ts) and written as inline custom properties on <html>, and a
 * second tab changing the accent leaves this one stale unless the `storage`
 * event re-applies it.
 */
export function AccentSync() {
  useEffect(() => {
    applyAccentColor(readStoredAccent() ?? DEFAULT_ACCENT);

    const onStorage = (event: StorageEvent) => {
      if (event.key === ACCENT_STORAGE_KEY) applyAccentColor(readStoredAccent() ?? DEFAULT_ACCENT);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return null;
}
