"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { driver, type DriveStep } from "driver.js";
import { Switch } from "@/components/ui/switch";
import {
  TUTORIAL_DONE_KEY,
  TUTORIAL_ENABLED_KEY,
  TUTORIAL_STEPS,
  clearTutorialCompleted,
  readTutorialCompleted,
  readTutorialEnabled,
  resetTutorial,
  writeTutorialCompleted,
  writeTutorialEnabled,
  type TutorialStep,
} from "@/lib/tutorial";

/**
 * Product tour, built on driver.js.
 *
 * driver.js is deliberately framework-agnostic — it renders a DOM overlay and
 * takes CSS selectors — so everything React-shaped is this file's job:
 *
 * - **Routing.** Steps can span pages. driver.js has no router, so Next is
 *   driven ahead of the highlight and the index is only advanced once the new
 *   route has actually committed; advancing immediately would try to highlight an
 *   element that does not exist yet.
 * - **Persistence.** Enabled/completed live in localStorage, read in an effect
 *   rather than during render so the server and first client render agree.
 * - **Remounting.** Navigating swaps the tree underneath driver.js, so the
 *   active step is re-applied on every pathname change rather than left
 *   pointing at a detached node.
 *
 * Styling lives in globals.css under `.driver-popover-*`, written against the
 * same custom properties as the rest of the app — which means a theme change is
 * picked up with no re-render, the reason driver.js was preferred here over a
 * library that computes inline styles.
 */

type TutorialContextValue = {
  /** Whether the tour may run at all. Mirrors the stored preference. */
  enabled: boolean;
  /** True while a tour is on screen. */
  running: boolean;
  setEnabled: (next: boolean) => void;
  /** Starts the tour from the first step, ignoring the completed flag. */
  start: () => void;
  /** Restarts from step one — what the Settings "Run again" button calls. */
  restart: () => void;
  /** Clears every trace of the tour and runs it — the escape hatch. */
  reset: () => void;
};

const TutorialContext = createContext<TutorialContextValue>({
  enabled: true,
  running: false,
  setEnabled: () => {},
  start: () => {},
  restart: () => {},
  reset: () => {},
});

export function useTutorial(): TutorialContextValue {
  return useContext(TutorialContext);
}

/** Fired when the preference changes so the snapshot below re-reads it. */
const TUTORIAL_TOGGLE_EVENT = "dobby-tutorial-toggle";

function subscribeEnabled(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(TUTORIAL_TOGGLE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(TUTORIAL_TOGGLE_EVENT, onChange);
  };
}

/** The preference is device-local, so the server has no opinion about it. */
const getEnabledSnapshot = () => readTutorialEnabled();
const getServerEnabledSnapshot = () => true;

/** Route a step targets, without its query — readiness is about the route. */
const routeOf = (href: string | undefined) => (href ? href.split("?")[0]! : undefined);

/** driver.js step for one of ours, keeping the route change out of it. */
function toDriveStep(step: TutorialStep): DriveStep {
  return {
    element: step.anchor ? `[data-tour="${step.anchor}"]` : undefined,
    // A missing anchor is almost always "the user has not connected a wallet
    // yet", which is not a failure — step over it rather than stalling.
    skipMissingElement: true,
    popover: {
      title: step.title,
      description: step.body,
      side: step.side ?? "bottom",
      align: step.align ?? "center",
    },
  };
}

/**
 * Settings switch for the tour. Also the fastest way to exercise the tour while
 * it is being worked on: turning it on after a dismissal clears the completed
 * flag, so the next visit to the dashboard replays it.
 */
export function TutorialToggle() {
  const { enabled, running, setEnabled } = useTutorial();
  return (
    <Switch
      checked={enabled}
      // While the tour is on screen the switch has to be able to stop it, not
      // just record the preference for next time.
      onCheckedChange={setEnabled}
      aria-label="Show the product tutorial"
      disabled={running}
    />
  );
}

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // Read as an external store: the server has no localStorage, and seeding it
  // from state in an effect would flash the default before the real preference
  // arrived.
  const enabled = useSyncExternalStore(subscribeEnabled, getEnabledSnapshot, getServerEnabledSnapshot);
  const [running, setRunning] = useState(false);
  const instanceRef = useRef<ReturnType<typeof driver> | null>(null);
  const pendingRef = useRef<number | null>(null);
  // Holds the scheduled start so an unrelated re-render cannot cancel it.
  const timerRef = useRef<number | null>(null);
  /*
   * `pathname` and `router` are read through refs so `start` stays
   * referentially stable for the life of the provider.
   *
   * This is the whole ball game. The auto-start lives in an effect keyed on
   * `start`, and an effect cancels its own timer whenever its dependencies
   * change identity. With `start` depending on `router` — which is not
   * guaranteed to be referentially stable across renders — any re-render inside
   * the 400ms window replaced the callback, cancelled the timer, and restarted
   * the wait. The dashboard re-renders constantly while its cards load, so the
   * tour never started.
   */
  const pathnameRef = useRef(pathname);
  const routerRef = useRef(router);
  useEffect(() => {
    pathnameRef.current = pathname;
    routerRef.current = router;
  }, [pathname, router]);

  const destroy = useCallback(() => {
    instanceRef.current?.destroy();
    instanceRef.current = null;
    pendingRef.current = null;
    // A start scheduled moments ago must not fire after teardown and bring the
    // overlay back on its own.
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setRunning(false);
  }, []);

  const start = useCallback(
    (force: boolean) => {
      if (typeof window === "undefined") return;
      if (!force && !readTutorialEnabled()) return;
      if (force) clearTutorialCompleted();

      instanceRef.current?.destroy();
      setRunning(true);

      const instance = driver({
        steps: TUTORIAL_STEPS.map(toDriveStep),
        // The tour is guidance, not a gate: Escape and the close control must
        // always work, and the page underneath stays usable.
        allowClose: true,
        allowKeyboardControl: true,
        animate: true,
        // The stage is an SVG path with fill/opacity written inline, so it has
        // to be set here — CSS cannot reach it. Kept light so the page stays
        // legible behind the cut-out.
        overlayColor: "#17181c",
        overlayOpacity: 0.32,
        // Long enough to read a sentence, short enough not to feel sticky.
        duration: 260,
        smoothScroll: true,
        // Scrolling is part of several steps; blocking it strands the tour.
        allowScroll: true,
        // Clicking the highlighted element should follow it, not step past it.
        advanceOnClick: false,
        stagePadding: 6,
        stageRadius: 12,
        showProgress: true,
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Done",
        closeBtnLabel: "Close the tutorial",

        onNextClick: (_element, _step, opts) => {
          const index = opts.index ?? 0;
          const next = TUTORIAL_STEPS[index + 1];
          // Navigate first; advancing here would highlight a node the next
          // route has not rendered yet. The pathname effect below re-applies
          // the step once the route settles.
          if (next?.href && routeOf(next.href) !== pathnameRef.current) {
            pendingRef.current = index + 1;
            routerRef.current.push(next.href);
            return;
          }
          opts.driver.moveNext();
        },

        onPrevClick: (_element, _step, opts) => {
          const index = opts.index ?? 0;
          const previous = TUTORIAL_STEPS[index - 1];
          if (previous?.href && routeOf(previous.href) !== pathnameRef.current) {
            pendingRef.current = index - 1;
            routerRef.current.push(previous.href);
            return;
          }
          opts.driver.movePrevious();
        },

        onDoneClick: () => {
          writeTutorialCompleted();
          destroy();
        },

        // Marks the panel before driver.js tears it out of the DOM, so it can
        // fade out instead of vanishing.
        onDestroyStarted: (_element, _step, opts) => {
          opts.state.popover?.wrapper.classList.add("driver-popover-leaving");
        },

        onCloseClick: () => {
          // Closing early is not completing it — the tour can be replayed from
          // Settings, and a dismissed tour should not silently never reappear.
          destroy();
        },

        onDestroyed: () => setRunning(false),
      });

      instanceRef.current = instance;

      // Step 1 lives on /app. Replay is reachable from Settings, so driving
      // index 0 straight away would resolve its anchor against the wrong route,
      // find nothing, and skip straight past it. Navigate first and let the
      // pathname effect below start the tour once the route has settled.
      const first = TUTORIAL_STEPS[0];
      if (first?.href && routeOf(first.href) !== pathnameRef.current) {
        pendingRef.current = 0;
        routerRef.current.push(first.href!);
        return;
      }
      instance.drive(0);
    },
    [destroy],
  );

  // Holds the scheduled start so an unrelated re-render cannot cancel it.
  const clearPendingDrive = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /*
   * Starts a step once the router is actually on that step's route.
   *
   * The timer is deliberately NOT returned from this effect as a cleanup. The
   * sequence for Replay from Settings is: set pending → push /app → the route
   * commits and re-runs this effect. A cleanup that cleared the timer would
   * cancel the very start it was scheduled for, which is why Replay did nothing
   * at all. Only an explicit teardown clears it.
   *
   * Waiting on the href rather than consuming the pending index eagerly is the
   * other half: the route has not committed yet at the point `start` returns.
   */
  useEffect(() => {
    const pending = pendingRef.current;
    if (pending === null) return;
    const step = TUTORIAL_STEPS[pending];
    if (step?.href && routeOf(step.href) !== pathname) return;
    pendingRef.current = null;
    clearPendingDrive();

    // The target is rendered by a child that may still be mounting, and
    // `skipMissingElement` turns "not there yet" into "this step never
    // happens" — which is how the Import step went missing: the route had
    // changed but the ledger table had not rendered. Poll briefly for the
    // anchor instead of guessing a delay and hoping.
    const selector = step.anchor ? `[data-tour="${step.anchor}"]` : undefined;
    const deadline = Date.now() + 2000;
    const attempt = () => {
      const ready = !selector || document.querySelector(selector) !== null;
      if (!ready && Date.now() < deadline) {
        timerRef.current = window.setTimeout(attempt, 80);
        return;
      }
      timerRef.current = null;
      instanceRef.current?.drive(pending);
    };
    timerRef.current = window.setTimeout(attempt, selector ? 40 : 0);
  }, [pathname, clearPendingDrive]);

  const setEnabled = useCallback(
    (next: boolean) => {
      writeTutorialEnabled(next);
      window.dispatchEvent(new CustomEvent(TUTORIAL_TOGGLE_EVENT));
      if (!next) destroy();
    },
    [destroy],
  );

  const restart = useCallback(() => start(true), [start]);

  /**
   * Full reset: forgets that the tour was ever finished and turns it back on.
   * Exposed because the switch cannot undo its own `off` — see `resetTutorial`.
   */
  const reset = useCallback(() => {
    resetTutorial();
    window.dispatchEvent(new CustomEvent(TUTORIAL_TOGGLE_EVENT));
    start(true);
  }, [start]);

  /*
 * Auto-run once, on the first visit to the dashboard.
 *
 * The timer is held in `timerRef` rather than returned as this effect's
 * cleanup, for the same reason the route-change drive is: a cleanup that
 * cleared it would cancel the very start it scheduled. Only `destroy` clears
 * it, so nothing — StrictMode's double-invoke, a re-render from the dashboard's
 * cards loading, an unrelated state change — can take the tour down with it.
 */
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    if (pathname !== "/app") return;
    if (!readTutorialEnabled() || readTutorialCompleted()) return;
    clearPendingDrive();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      startedRef.current = true;
      start(false);
    }, 400);
  }, [pathname, start, clearPendingDrive]);

  // Tear down on unmount so a stray overlay can't outlive the app.
  useEffect(() => () => instanceRef.current?.destroy(), []);

  return (
    <TutorialContext.Provider value={{ enabled, running, setEnabled, start: () => start(true), restart, reset }}>
      {children}
    </TutorialContext.Provider>
  );
}

export { TUTORIAL_DONE_KEY, TUTORIAL_ENABLED_KEY };