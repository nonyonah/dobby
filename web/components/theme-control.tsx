"use client";

import { useCallback, useSyncExternalStore } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { MonitorIcon, Moon01Icon, Sun01Icon } from "@hugeicons/core-free-icons";
import { Segmented } from "@/components/ui/segmented";
import { readStoredTheme, resolveTheme, setTheme, THEME_CHANGE_EVENT, type ResolvedTheme, type ThemePreference } from "@/lib/theme";

/**
 * localStorage is an external store: the OS writing a new colour scheme, another
 * tab changing the theme, or `setTheme` in this tab are all updates to it, and
 * `useSyncExternalStore` is what lets React subscribe to them.
 *
 * The server snapshot is always "system" because the server cannot read
 * localStorage. That is also what the no-flash script starts from, so the first
 * client render matches the server exactly and hydration stays quiet — the
 * stored preference is picked up on the first subscription check instead of
 * being read during render.
 */
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  const media = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  media?.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    media?.removeEventListener("change", onChange);
  };
}

const getSnapshot = (): ThemePreference => readStoredTheme() ?? "system";
const getServerSnapshot = (): ThemePreference => "system";

/**
 * Reads and writes the theme preference.
 */
export function useTheme() {
  const preference = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const resolved: ResolvedTheme = resolveTheme(preference);

  const update = useCallback((next: ThemePreference) => {
    // `setTheme` persists, applies, and dispatches THEME_CHANGE_EVENT, which
    // re-runs the snapshot above — no local state to keep in step.
    setTheme(next);
  }, []);

  /** Flips to the opposite of whatever is on screen, pinning away from system. */
  const toggle = useCallback(() => {
    update(resolveTheme(preference) === "dark" ? "light" : "dark");
  }, [preference, update]);

  return { preference, resolved, setPreference: update, toggle };
}

const OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/**
 * Three-way picker for Settings. Uses Segmented because these are mutually
 * exclusive choices that read best as a row of pills — not a hand-rolled tab
 * strip, and not three separate dropdowns for a single decision.
 */
export function ThemeSegmented() {
  const { preference, setPreference } = useTheme();
  return (
    <Segmented
      label="Theme"
      value={preference}
      onValueChange={(value) => setPreference(value as ThemePreference)}
      options={OPTIONS}
      // Three short pills always fit; scrolling would only risk clipping one.
      scrollable={false}
    />
  );
}

/**
 * Compact control for the landing nav, where a full three-way row would crowd
 * the header. Shows what clicking will switch *to*: a sun while dark is active,
 * a moon while light is, and the system glyph while still following the OS.
 */
export function ThemeToggleButton() {
  const { preference, resolved, toggle } = useTheme();
  const following = preference === "system";
  const Icon = following ? MonitorIcon : resolved === "dark" ? Sun01Icon : Moon01Icon;
  const label = following
    ? `Theme: following your system (${resolved})`
    : `Theme: ${resolved}. Switch to ${resolved === "dark" ? "light" : "dark"}.`;

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className="inline-flex size-9 cursor-pointer items-center justify-center rounded-[50px] border border-line bg-card text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
    >
      <HugeiconsIcon icon={Icon} size={16} aria-hidden="true" strokeWidth={2} />
    </button>
  );
}