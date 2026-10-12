"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Clock01Icon } from "@hugeicons/core-free-icons";
import { usePlan } from "@/components/plan-provider";
import { cn } from "cn";

/**
 * "Pro trial: N days left".
 *
 * Reads the server's own count rather than subtracting two dates here — the
 * server already does the rounding, and a client that recomputes it will
 * disagree by a day at the boundary and look broken.
 *
 * Only rendered while a trial is actually running. After it lapses the app says
 * something quiet in Settings instead: a countdown to nothing at the top of the
 * dashboard would be nagging.
 */
export function TrialPill({ className }: { className?: string }) {
  const { trialDaysLeft, loading } = usePlan();
  if (loading) return null;
  if (trialDaysLeft === null) return null;

  const today = trialDaysLeft <= 1;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[50px] border border-line bg-card px-2.5 py-1",
        "text-[12px] font-medium text-muted-foreground",
        className,
      )}
      title={today ? "Your free trial ends today" : `Your free trial ends in ${trialDaysLeft} days`}
    >
      <HugeiconsIcon icon={Clock01Icon} size={13} className="shrink-0 text-primary" aria-hidden="true" />
      {/* Short on a phone. The top bar also carries Get Started and the create
          button, and "Pro trial: 7 days left" does not fit beside them without
          pushing the title off a 360px screen. The full sentence is the title
          attribute either way. */}
      <span className="sm:hidden">{trialDaysLeft === 0 ? "today" : `${trialDaysLeft}d`}</span>
      <span className="hidden sm:inline">Pro trial: {trialDaysLeft === 0 ? "ends today" : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left`}</span>
    </span>
  );
}