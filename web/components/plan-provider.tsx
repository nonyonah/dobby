"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useApi } from "@/hooks/use-api";

/** Effective plan: inside the 7-day trial, a paid subscriber, or lapsed (view-only). */
export type Plan = "TRIAL" | "ACTIVE" | "EXPIRED";

export type MeProfile = {
  currency?: string;
  country?: string | null;
  taxJurisdiction?: string | null;
  theme?: string | null;
  accentColor?: string | null;
};

export type MeData = {
  plan?: Plan;
  /** When the free trial lapses (ISO timestamp), when the API reports one. */
  trialEndsAt?: string | null;
  onboardedAt?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  profile?: MeProfile | null;
};

type PlanContextValue = {
  /** Effective plan, or `null` until the first read resolves. */
  plan: Plan | null;
  /** Full access: trial still running or subscription active. */
  isPro: boolean;
  /** Trial lapsed — everything stays visible, writes are paused. */
  expired: boolean;
  /** When the trial ends (ISO), when known. */
  trialEndsAt: string | null;
  loading: boolean;
  /** The signed-in user's record from `/v1/me` (plan + profile + onboarding). */
  me: MeData | null;
  /** Re-reads the plan from the API; call after a checkout returns or a subscription changes. */
  refresh: () => void;
};

const PlanContext = createContext<PlanContextValue>({
  plan: null,
  isPro: false,
  expired: false,
  trialEndsAt: null,
  loading: true,
  me: null,
  refresh: () => {},
});

function readPlan(value: unknown): Plan | null {
  return value === "TRIAL" || value === "ACTIVE" || value === "EXPIRED" ? value : null;
}

/**
 * Reads the signed-in user's `/v1/me` once per session (and whenever
 * `refresh` is called). Until the read resolves the plan is `null`, which
 * fails closed (`isPro` false, so nothing Pro fires early) while never
 * flashing a lapsed-trial state at someone whose subscription is fine; a
 * failed read stays `null` for the same reason.
 */
export function PlanProvider({ children }: { children: React.ReactNode }) {
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [me, setMe] = useState<MeData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => {
    setLoaded(false);
    setVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;
    void api
      .get<{ data: MeData }>("/v1/me")
      .then((response) => {
        if (cancelled) return;
        setPlan(readPlan(response.data.plan));
        setTrialEndsAt(response.data.trialEndsAt ?? null);
        setMe(response.data);
      })
      .catch(() => {
        if (cancelled) return;
        setPlan(null);
        setTrialEndsAt(null);
        setMe(null);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [api, isLoaded, isSignedIn, version]);

  // Signed-out users are never "loading": they simply have no access.
  const loading = !isLoaded ? true : isSignedIn ? !loaded : false;

  const value = useMemo(
    () => ({
      plan,
      isPro: plan === "TRIAL" || plan === "ACTIVE",
      expired: plan === "EXPIRED",
      trialEndsAt,
      loading,
      me,
      refresh,
    }),
    [plan, trialEndsAt, loading, me, refresh],
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  return useContext(PlanContext);
}
