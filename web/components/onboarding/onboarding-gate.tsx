"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePlan } from "@/components/plan-provider";

/**
 * Sends users who have not finished onboarding to /onboarding. Renders nothing
 * while redirecting so the dashboard never flashes first. A failed `/v1/me`
 * read (me === null) fails open: signed-in users land on the dashboard.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { me, loading } = usePlan();
  const router = useRouter();
  const needsOnboarding = !loading && me !== null && !me.onboardedAt;

  useEffect(() => {
    if (needsOnboarding) router.replace("/onboarding");
  }, [needsOnboarding, router]);

  if (needsOnboarding) return null;
  return <>{children}</>;
}
