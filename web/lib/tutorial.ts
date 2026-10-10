/**
 * Product tour — step definitions.
 *
 * Copy follows the rule the rest of the product follows: plain, specific, and
 * never selling. Each step names what the thing on screen actually does, so
 * someone who skips it loses nothing they needed.
 *
 * Steps are keyed by `data-tour` attributes rather than CSS selectors, so
 * reordering or restyling a page cannot silently break the tour the way a
 * `.grid > div:nth-child(2)` would.
 *
 * A step may carry a `href`. driver.js has no router integration, so the
 * wrapper navigates first and only then advances — see `TutorialProvider`.
 */

export interface TutorialStep {
  /** `data-tour` value of the element to highlight. Omit for a centred card. */
  anchor?: string;
  /** Client route to be on before this step can highlight anything. */
  href?: string;
  title: string;
  body: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

export const TUTORIAL_ENABLED_KEY = "dobby-tutorial-enabled";
export const TUTORIAL_DONE_KEY = "dobby-tutorial-completed";

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    href: "/app",
    anchor: "dashboard-cards",
    side: "bottom",
    align: "start",
    title: "Your money, at a glance",
    body: "These cards rearrange however you like. Drag one into place, or hide what you don't need from Customize.",
  },
  {
    /**
     * Anchored to the view switcher, not the table. The transactions page opens
     * on "To review", so a table anchor resolves to nothing on arrival and
     * driver.js silently skips the step — which is exactly how the first cut of
     * this tour lost step 2. The switcher is present in both views.
     */
    href: "/transactions",
    anchor: "transactions-views",
    side: "bottom",
    align: "start",
    title: "Everything, categorised",
    body: "Dobby sorts each transaction as it arrives and asks only when it isn't sure. Anything ambiguous waits in To review until you say otherwise.",
  },
  {
    /**
     * Carries `?view=ledger` deliberately. The Import button only exists in the
     * ledger view, and the page opens on "To review" — so without the query the
     * anchor resolves to nothing and driver.js skips the step, which is the same
     * failure the view-switcher step documents.
     */
    href: "/transactions?view=ledger",
    anchor: "import-statement",
    side: "bottom",
    align: "end",
    title: "Bring your statements in",
    body: "Drop in a bank statement or a CSV and Dobby reads it, sorts it and checks it adds up — so nothing goes missing quietly.",
  },
  {
    href: "/insights",
    anchor: "insights-sections",
    side: "bottom",
    align: "start",
    title: "Where it went",
    body: "Cashflow, spending, income, stablecoins and tax. Pick a month and every card, chart and table follows it.",
  },
  {
    href: "/settings",
    anchor: "settings-preferences",
    side: "left",
    align: "start",
    title: "Yours to tune",
    body: "Currency, tax jurisdiction, accent and theme all live here, and you can switch this tour off whenever you like.",
  },
  {
    title: "You're set",
    body: "Import a statement or connect your email whenever you're ready. Nothing you have added is ever deleted.",
  },
];

/** Reads stored tutorial state. Safe to call during SSR. */
export function readTutorialEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(TUTORIAL_ENABLED_KEY) !== "off";
  } catch {
    return true;
  }
}

export function readTutorialCompleted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(TUTORIAL_DONE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeTutorialEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TUTORIAL_ENABLED_KEY, enabled ? "on" : "off");
  } catch {
    // storage unavailable — the preference just won't survive the reload
  }
}

export function writeTutorialCompleted(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TUTORIAL_DONE_KEY, "true");
  } catch {
    // ignore
  }
}

export function clearTutorialCompleted(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TUTORIAL_DONE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Puts the tour back to a first-time state: enabled again, never completed.
 *
 * The switch alone is not an escape hatch. It writes `off`, and a browser that
 * has recorded it once will silently suppress the tour for every later account
 * signed into it — the flags live in localStorage, not on the user record — and
 * nothing in the UI could undo that. This is.
 */
export function resetTutorial(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TUTORIAL_DONE_KEY);
    window.localStorage.removeItem(TUTORIAL_ENABLED_KEY);
  } catch {
    // ignore
  }
}