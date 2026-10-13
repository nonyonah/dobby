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
  /**
   * Whether this step applies to the person taking it.
   *
   * Needed because some steps are jurisdiction-specific. A tour that tells a
   * US user about Nigerian offramps is not a longer tour, it is a wrong one —
   * and the providers page it points at is not even reachable for them.
   */
  when?: () => boolean;
}

/**
 * The steps that apply right now.
 *
 * `when` is evaluated at the moment the tour starts, not at import, because the
 * jurisdiction arrives with the profile and can change mid-session.
 */
export function activeTutorialSteps(): TutorialStep[] {
  return TUTORIAL_STEPS.filter((step) => {
    try {
      return step.when?.() ?? true;
    } catch {
      // A step whose condition throws is dropped rather than taking the whole
      // tour down with it — one broken predicate should cost one step.
      return false;
    }
  });
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
    /**
     * The plus in the sidebar is where importing actually starts — the Import
     * button on the transactions page is the second door to the same dialog.
     * No `href`: it lives in the sidebar, so it is already on screen wherever
     * the previous step left off.
     */
    anchor: "quick-create",
    side: "right",
    align: "end",
    title: "Add anything, anywhere",
    body: "That plus opens the same import — statements, receipts, budgets, goals — without leaving the page you are on.",
  },
  {
    href: "/insights",
    anchor: "insights-sections",
    side: "bottom",
    align: "start",
    title: "Where it went",
    body: "Cashflow, spending, income and stablecoins. Pick a month and every card, chart and table follows it.",
  },
  {
    /**
     * Carries `?section=tax`, which without this query the step would arrive on
     * Cashflow and highlight a panel that isn't there — the same failure the
     * `?view=ledger` step above documents.
     */
    href: "/insights?section=tax",
    anchor: "insights-tax",
    side: "bottom",
    align: "start",
    title: "Your tax, worked out",
    body: "Dobby counts the deductible expenses you've already categorised, estimates what you'll owe on your income, and keeps the filing checklist beside it. Set your jurisdiction once and these follow it.",
  },
  {
    /**
     * No `href`: the Connections section is on the Settings page the previous
     * step already navigated to, so the tour does not bounce back and forth.
     */
    anchor: "settings-connections",
    side: "right",
    align: "start",
    title: "Add what you hold",
    body: "Connect a Base or Solana address and Dobby tracks its balances and activity. Nothing is read without you asking it to.",
  },
  {
    href: "/settings/categories-rules",
    anchor: "categories-rules",
    side: "bottom",
    align: "start",
    title: "Set it up once",
    body: "Rename or add categories, and save a rule like \"always call this Shopping\" so the same merchant is classified the same way every time.",
  },
  {
    /**
     * Nigeria only. Offramps and their addresses are meaningless to anyone
     * filing elsewhere, and the page this points at is not in their Settings at
     * all — sending them here would be a 404 with a lecture attached.
     */
    // Excluded only when a non-Nigerian jurisdiction is explicitly stored, so
    // this reads as "hide for everyone else" rather than "show only if a flag
    // is set". The flag is written when the jurisdiction is changed and never on
    // load, so requiring it would hide the step from the default account — the
    // one most likely to want it.
    when: () => {
      if (typeof window === "undefined") return true;
      const stored = window.localStorage?.getItem("dobby-tax-jurisdiction");
      return stored === null || stored === undefined || stored === "" || stored === "nigeria";
    },
    href: "/settings/stablecoin-providers",
    anchor: "stablecoin-providers",
    side: "bottom",
    align: "start",
    title: "Name your providers",
    body: "Add the exchanges you cash out through, with their addresses, so Dobby can tell a cash-out from an ordinary transfer.",
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