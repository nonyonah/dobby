"use client";

import * as React from "react";
import { grantConsent, revokeConsent } from "@/lib/analytics";
import { Button } from "@/components/ui/button";

/**
 * Consent gate for product analytics.
 *
 * PostHog's script is only fetched after someone presses Accept, so declining
 * genuinely means no vendor call, no cookie and no identifier — the state this
 * component renders before any choice has been made. Withdrawal stays reachable
 * afterwards from Settings rather than being a one-time modal nobody can undo.
 *
 * Accept and Decline are deliberately equal weight: the choice is not nudged.
 */
export function AnalyticsConsentBanner({ onDecided }: { onDecided?: () => void }) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    // A recorded choice means the banner has done its job.
    if (window.localStorage.getItem("dobby-analytics-consent")) return;
    // Give the app a moment to settle before asking, so this is not the first
    // thing competing with real content on a cold load.
    const timer = window.setTimeout(() => setVisible(true), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  const decide = async (choice: "granted" | "denied") => {
    if (choice === "granted") await grantConsent();
    else await revokeConsent();
    setVisible(false);
    onDecided?.();
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Analytics consent"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4"
    >
      <div className="flex w-full max-w-2xl flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-lg sm:flex-row sm:items-center">
        <p className="m-0 flex-1 text-[13px] leading-relaxed text-muted-foreground">
          We use privacy-friendly analytics to learn which parts of Dobby get used, so we fix the ones that do not
          work. It never sees your transactions, amounts, merchants or tax figures — only which features you
          touch. Decline and nothing is loaded at all.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="secondary" onClick={() => void decide("denied")}>
            Decline
          </Button>
          <Button type="button" onClick={() => void decide("granted")}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}