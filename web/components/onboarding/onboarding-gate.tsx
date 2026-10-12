"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePlan } from "@/components/plan-provider";

/**
 * Sends users who have not finished onboarding to /onboarding.
 *
 * Three states, and the distinction between the last two is the whole point:
 *
 *   - still reading  — render nothing. Rendering children here is what made the
 *     dashboard flash and then vanish a moment later as the redirect fired.
 *   - read, no
 *     `onboardedAt`  — a real account that has not onboarded; send it on.
 *   - read failed    — an outage, not a missing profile. Fail open so a broken
 *     API does not trap somebody on a redirect loop they cannot leave, and so a
 *     genuine new user is not bounced forever by a request that never landed.
 *
 * `PlanProvider` retries before concluding it has failed, so this only sees a
 * failure once retrying has already been tried.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { me, loading, meFailed } = usePlan();
  const router = useRouter();

  const answered = !loading && me !== null;
  const needsOnboarding = answered && !me.onboardedAt;

  useEffect(() => {
    if (needsOnboarding) router.replace("/onboarding");
  }, [needsOnboarding, router]);

  // Blank rather than the dashboard, so the redirect is not a visible undo. A
  // failed read is the one case that renders through, because there is nothing
  // better to show and nothing was learned about this account.
  if (loading || needsOnboarding) return null;
  if (meFailed && me === null) return <>{children}</>;

  return <>{children}</>;
}