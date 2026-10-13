"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { setTrialDays } from "@/lib/trial";
import { useAuth } from "@clerk/nextjs";
import { useApi } from "@/hooks/use-api";

/** Effective plan: inside the free trial, a paid subscriber, or lapsed (view-only). */
/** Kept so callers that switch on it still work; access comes from `isPro`. */
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
  entitlement?: unknown;
  trialDays?: number;
  lastName?: string | null;
  email?: string | null;
  profile?: MeProfile | null;
};

/**
 * How hard to try before deciding the server is unreachable.
 *
 * Two attempts, a beat apart. Enough to ride out the cold-start case on a
 * brand-new account, short enough that a genuinely down API still lands the user
 * somewhere they can see the problem rather than spinning.
 */
const ME_READ_ATTEMPTS = 2;
const ME_READ_RETRY_MS = 400;

type PlanContextValue = {
  /** Effective plan, or `null` until the first read resolves. */
  plan: Plan | null;
  /** Full access: trial still running or subscription active. */
  isPro: boolean;
  /** Trial lapsed — everything stays visible, writes are paused. */
  expired: boolean;
  /** Whether a trial was ever started, so "never started" can be told from "ended". */
  trialStarted: boolean;
  /** Whole days left in the trial, null when there is no live trial. */
  trialDaysLeft: number | null;
  /** When the trial ends (ISO), when known. */
  trialEndsAt: string | null;
  loading: boolean;
  /** The signed-in user's record from `/v1/me` (plan + profile + onboarding). */
  me: MeData | null;
  /** Re-reads the plan from the API; call after a checkout returns or a subscription changes. */
  refresh: () => void;
  /**
   * `/v1/me` was asked and never answered, as opposed to answering with no user.
   *
   * Kept separate because the two mean opposite things to a gate: no user is an
   * account that needs onboarding, an unanswered request is an outage and must
   * not be treated as one.
   */
  meFailed: boolean;
};

const PlanContext = createContext<PlanContextValue>({
  plan: null,
  isPro: false,
  expired: false,
  trialStarted: false,
  trialDaysLeft: null,
  trialEndsAt: null,
  loading: true,
  me: null,
  refresh: () => {},
  meFailed: false,
});

function readPlan(value: unknown): Plan | null {
  return value === "TRIAL" || value === "ACTIVE" || value === "EXPIRED" ? value : null;
}

export type Entitlement = {
  isPro: boolean;
  status: string;
  trialStarted: boolean;
  trialDaysLeft: number | null;
  trialEndsAt: string | null;
};

/** Fails closed: an unreadable answer is not Pro, but it is not a lapse either. */
function readEntitlement(value: unknown): Entitlement {
  const raw = (value ?? {}) as Partial<Entitlement>;
  return {
    isPro: raw.isPro === true,
    status: typeof raw.status === "string" ? raw.status : "free",
    trialStarted: raw.trialStarted === true,
    trialDaysLeft: typeof raw.trialDaysLeft === "number" ? raw.trialDaysLeft : null,
    trialEndsAt: typeof raw.trialEndsAt === "string" ? raw.trialEndsAt : null,
  };
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
  const [entitlement, setEntitlement] = useState<Entitlement>(readEntitlement(null));
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [me, setMe] = useState<MeData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [meFailed, setMeFailed] = useState(false);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => {
    setLoaded(false);
    setVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;

    const read = (attempt: number) => {
      void api
        .get<{ data: MeData }>("/v1/me")
        .then((response) => {
          if (cancelled) return;
          // Entitlement is read from the server, not recomputed here. This used
          // to be `plan === "TRIAL" || plan === "ACTIVE"` — a second copy of the
          // rule, which is how an account could be offered an upgrade by the UI
          // while the API granted the same feature for free.
          setEntitlement(readEntitlement(response.data.entitlement));
          // The server owns the trial length; copy reads it rather than restating it.
          setTrialDays(response.data.trialDays);
          setPlan(readPlan(response.data.plan));
          setTrialEndsAt(response.data.trialEndsAt ?? null);
          setMe(response.data);
          setMeFailed(false);
        })
        .catch(() => {
          if (cancelled) return;
          // Retried rather than given up on. The first read for a brand-new
          // account is the heaviest one the API ever serves — it creates the
          // user, seeds the category list and reconciles legacy names — so it is
          // the one most likely to fail transiently. Giving up on it left `me`
          // null for the rest of the session, and every gate that reads `me`
          // fails open, which is why a new user landed on the dashboard with no
          // onboarding until they refreshed.
          if (attempt < ME_READ_ATTEMPTS) {
            window.setTimeout(() => read(attempt + 1), ME_READ_RETRY_MS * attempt);
            return;
          }
          setEntitlement(readEntitlement(null));
          setPlan(null);
          setTrialEndsAt(null);
          setMe(null);
          setMeFailed(true);
        })
        .finally(() => {
          // Only settle once the last attempt is in, so `loading` stays true
          // across a retry rather than flashing the unauthenticated state.
          if (!cancelled) setLoaded(true);
        });
    };

    read(1);
    return () => {
      cancelled = true;
    };
  }, [api, isLoaded, isSignedIn, version]);

  // Signed-out users are never "loading": they simply have no access.
  const loading = !isLoaded ? true : isSignedIn ? !loaded : false;

  /*
   * The countdown has to move on its own.
   *
   * `trialDaysLeft` comes from the server's answer to `/v1/me`, which is fetched
   * once when the provider mounts. The server rounds with
   * `Math.ceil(daysRemaining / 86_400_000)`, so without this the pill sat on
   * "7 days" until the page was reloaded — which reads as a frozen counter even
   * though the number underneath was right.
   *
   * Recomputed from the end date on the same rounding rule the server uses,
   * rather than by re-fetching, so the two cannot disagree by a day at the
   * boundary. `trialEndsAt` is the server's own value, so this only re-applies
   * its arithmetic to the current clock rather than inventing a second opinion
   * about when the trial ends.
   */
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (trialEndsAt === null) return;
    const id = window.setInterval(() => setTick((current) => current + 1), 60_000);
    return () => window.clearInterval(id);
  }, [trialEndsAt]);

  const liveTrialDaysLeft = useMemo(() => {
    // No end date means there is nothing to count down to, so the server's own
    // answer stands.
    if (entitlement.trialDaysLeft === null || trialEndsAt === null) return entitlement.trialDaysLeft;
    // Same `Math.ceil(remaining / 86_400_000)` the server uses, so the two agree
    // at the boundary instead of the pill claiming a day the API does not.
    const endsAt = new Date(trialEndsAt).getTime();
    // An unparseable date is the server's problem to report, not something to
    // render as "0 days left" and quietly hide a live trial behind.
    if (!Number.isFinite(endsAt)) return entitlement.trialDaysLeft;
    return Math.max(0, Math.ceil((endsAt - Date.now()) / 86_400_000));
  }, [entitlement.trialDaysLeft, trialEndsAt, tick]);

  const value = useMemo(
    () => ({
      plan,
      // From the server's answer, never from the status string.
      isPro: entitlement.isPro,
      // A lapsed trial, not merely "not Pro". A brand-new account has not
      // started one, and telling that account its trial has ended is the one
      // thing it cannot possibly be true of.
      expired: !entitlement.isPro && entitlement.trialStarted && loaded,
      trialStarted: entitlement.trialStarted,
      trialDaysLeft: liveTrialDaysLeft,
      trialEndsAt,
      loading,
      me,
      refresh,
      meFailed,
    }),
    [plan, entitlement, trialEndsAt, loading, loaded, me, refresh, meFailed, liveTrialDaysLeft],
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  return useContext(PlanContext);
}
