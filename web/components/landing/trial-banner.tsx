"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { trialLength } from "@/lib/trial";

/**
 * The free-trial banner for the marketing site.
 *
 * Deliberately a claim about the product rather than a countdown: a visitor has
 * no trial running, so a live counter would be a lie with a number on it. The
 * in-app pill is the one that counts down, because there it counts down
 * something real.
 *
 * Dismissal is remembered per device and shared across tabs. Someone who has
 * read it once and dismissed it should not see it again on every page load —
 * re-showing it is how a banner becomes something people learn to ignore, which
 * costs more than the few signups it wins from someone who already scrolled
 * past it once.
 */

const STORAGE_KEY = "dobby-trial-banner-dismissed";
const DISMISS_EVENT = "dobby-trial-banner-dismissed";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function TrialBanner() {
  // null until the client has looked. Reading localStorage during render would
  // render one thing on the server and another on the client, which React
  // reports as a hydration mismatch and quietly discards.
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    setDismissed(readDismissed());
    // Another tab dismissing it should take this one down with it, or the same
    // person sees it twice across two windows.
    const onDismiss = () => setDismissed(true);
    window.addEventListener(DISMISS_EVENT, onDismiss);
    window.addEventListener("storage", onDismiss);
    return () => {
      window.removeEventListener(DISMISS_EVENT, onDismiss);
      window.removeEventListener("storage", onDismiss);
    };
  }, []);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Storage unavailable — the banner simply returns on the next visit.
    }
    setDismissed(true);
    window.dispatchEvent(new CustomEvent(DISMISS_EVENT));
  }, []);

  if (dismissed) return null;

  return (
    <div className="border-b border-line bg-secondary/60">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-2.5">
        <p className="m-0 min-w-0 flex-1 text-[13px] leading-relaxed text-foreground">
          <span className="font-medium">{trialLength()} free trial.</span>{" "}
          <span className="text-muted-foreground">
            No card required — import a statement, connect an email, and see where you stand before you pay anything.
          </span>
        </p>
        <Button variant="secondary" size="small" className="shrink-0" onClick={dismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}