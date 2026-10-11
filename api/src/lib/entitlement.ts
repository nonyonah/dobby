import type { PlanStatus } from "@prisma/client";

/**
 * Entitlement: the one function that decides whether an account has Pro.
 *
 * Everything that gates a paid surface calls this, on the server, against server
 * time. There is deliberately no second copy — the old setup had the rule
 * written out in `computeEffectivePlan` here and again as
 * `plan === "TRIAL" || plan === "ACTIVE"` in the client, which is how a trial
 * user came to be shown an upgrade prompt by the app and full access by the API
 * at the same time.
 *
 * A device clock is never consulted. A user whose laptop is a day fast would
 * otherwise be shown a trial that had already ended, or lose access early.
 */

export type Entitlement = {
  isPro: boolean;
  status: PlanStatus;
  /** Whole days left in the trial, null when there is no live trial. */
  trialDaysLeft: number | null;
  /** Server time at which the trial window closes, if one is open. */
  trialEndsAt: Date | null;
};

export type EntitlementRow = {
  planStatus: PlanStatus;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  bachsSubscriptionStatus: string | null;
  bachsCurrentPeriodEnd: Date | null;
  bachsCancelAtPeriodEnd: boolean;
  planExpiresAt: Date | null;
};

/**
 * Length of the free trial, in days. No card, no subscription — the trial is a
 * window in our own database and ends on its own.
 *
 * One constant. Everything that grants, reports or describes a trial reads it
 * here, so no caller hardcodes a number and drifts from the rest.
 */
export const TRIAL_DAYS = 14;

/**
 * Documents Composio may fetch while an account is on trial.
 *
 * Cost control, not entitlement: every email pulled is a per-document charge we
 * pay, and an unbounded trial is an unbounded bill. Paying accounts are not
 * capped by this — they are not on our dime.
 */
export const TRIAL_EMAIL_FETCH_LIMIT = 50;

/** When the trial granted to a user starting now would end. */
export function trialWindowFrom(start: Date = new Date()): { trialStartedAt: Date; trialEndsAt: Date } {
  return {
    trialStartedAt: start,
    trialEndsAt: new Date(start.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
  };
}

/** Whole days remaining, rounded up so 30 minutes still reads as "1 day left". */
function daysLeft(until: Date, now: Date): number {
  return Math.max(0, Math.ceil((until.getTime() - now.getTime()) / 86_400_000));
}

/**
 * Resolves what an account is entitled to right now.
 *
 * Pro is either an unexpired trial or money actually in: a paid subscription
 * that is live, or a one-time term that has not lapsed. Payment wins outright —
 * someone who upgrades with four trial days left keeps Pro for the paid period
 * rather than dropping back to the trial the moment it expires.
 *
 * A failed renewal (`past_due`) keeps access, because the customer has already
 * paid for the period they are in and a retry is still running. An explicit
 * cancel does not, once the period it was paid for has run out.
 */
export function getEntitlement(user: EntitlementRow | null, now: Date = new Date()): Entitlement {
  if (!user) {
    return { isPro: false, status: "free", trialDaysLeft: null, trialEndsAt: null };
  }

  const trialEndsAt = user.trialEndsAt ?? null;
  const trialLive = trialEndsAt !== null && trialEndsAt.getTime() > now.getTime();

  const paid = isPaidAndLive(user, now);

  // Payment outranks the trial clock in both directions: an account that has
  // paid is Pro even when the trial window is still open, and an account whose
  // trial lapsed while subscribed does not fall off a cliff on day eight.
  if (paid) {
    return { isPro: true, status: normalizePaidStatus(user), trialDaysLeft: trialLive ? daysLeft(trialEndsAt!, now) : null, trialEndsAt };
  }

  if (trialLive) {
    return { isPro: true, status: "trial", trialDaysLeft: daysLeft(trialEndsAt!, now), trialEndsAt };
  }

  const lapsed = normalizeLapsedStatus(user);
  return { isPro: false, status: lapsed, trialDaysLeft: null, trialEndsAt };
}

/**
 * True when money is actually in and still covering the current period.
 *
 * The one thing that ends access is the end of a period nobody paid for. A
 * cancel set to run at period end leaves that period paid for, whether Bachs
 * reports it as `active` still or already flipped it to `canceled` — so the
 * period end decides, not the status word. Checking the status first is what
 * let an account be cut off mid-period, which is exactly when a customer would
 * be most annoyed.
 */
function isPaidAndLive(user: EntitlementRow, now: Date): boolean {
  const status = user.bachsSubscriptionStatus ?? "";

  if (user.bachsCancelAtPeriodEnd && user.bachsCurrentPeriodEnd) {
    if (status === "active" || status === "past_due" || status === "canceled") {
      return user.bachsCurrentPeriodEnd.getTime() > now.getTime();
    }
  }

  if (status === "active" || status === "past_due") return true;

  // One-time terms (a crypto checkout) carry no subscription, just an end date.
  if (user.planExpiresAt) {
    return user.planExpiresAt.getTime() > now.getTime();
  }
  return false;
}

/** Stored status for a paying account, so a stuck status cannot mask a payment. */
function normalizePaidStatus(user: EntitlementRow): PlanStatus {
  if (user.bachsSubscriptionStatus === "past_due") return "past_due";
  if (user.bachsSubscriptionStatus === "canceled") return "canceled";
  if (user.planExpiresAt) return "pro";
  return "pro";
}

/** Status for an account that is not entitled to anything right now. */
function normalizeLapsedStatus(user: EntitlementRow): PlanStatus {
  const status = user.bachsSubscriptionStatus;
  if (status === "canceled") return "canceled";
  if (status === "past_due") return "past_due";
  if (user.trialStartedAt !== null) return "free";
  return user.planStatus === "trial" ? "free" : user.planStatus;
}

/** Columns `getEntitlement` needs, so no caller has to hand-build the shape. */
export const entitlementSelect = {
  planStatus: true,
  trialStartedAt: true,
  trialEndsAt: true,
  bachsSubscriptionStatus: true,
  bachsCurrentPeriodEnd: true,
  bachsCancelAtPeriodEnd: true,
  planExpiresAt: true,
} as const;