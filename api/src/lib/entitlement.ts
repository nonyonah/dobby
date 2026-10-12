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
  /**
   * Whether a trial was ever started.
   *
   * Distinct from `isPro: false`, and the reason "your trial has ended" is not
   * shown to someone who never had one. The trial starts on the first Pro
   * action, so a brand-new account is legitimately not Pro — but it is not a
   * lapsed trial either, and the two need different copy.
   */
  trialStarted: boolean;
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
 * here, so no caller hardcodes a number and drifts from the rest. The web reads
 * it through `/v1/me` for the same reason.
 *
 * Back to seven from fourteen. Accounts already holding a fourteen-day window
 * keep it: shortening a trial someone is already inside is taking something away
 * rather than changing what is offered next.
 */
export const TRIAL_DAYS = 7;

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
    return { isPro: false, status: "free", trialStarted: false, trialDaysLeft: null, trialEndsAt: null };
  }

  const trialStarted = user.trialStartedAt !== null;

  const trialEndsAt = user.trialEndsAt ?? null;
  const trialLive = trialEndsAt !== null && trialEndsAt.getTime() > now.getTime();

  const paid = isPaidAndLive(user, now);

  // Payment outranks the trial clock in both directions: an account that has
  // paid is Pro even when the trial window is still open, and an account whose
  // trial lapsed while subscribed does not fall off a cliff on day eight.
  if (paid) {
    return { isPro: true, status: normalizePaidStatus(user), trialStarted, trialDaysLeft: trialLive ? daysLeft(trialEndsAt!, now) : null, trialEndsAt };
  }

  if (trialLive) {
    return { isPro: true, status: "trial", trialStarted, trialDaysLeft: daysLeft(trialEndsAt!, now), trialEndsAt };
  }

  const lapsed = normalizeLapsedStatus(user);
  return { isPro: false, status: lapsed, trialStarted, trialDaysLeft: null, trialEndsAt };
}

/**
 * Statuses that mean money is in and the period is still running.
 *
 * `past_due` is here deliberately: the customer has already paid for the period
 * they are in and a retry is still running, so cutting access there would
 * punish them for our billing provider's timing.
 *
 * `trialing` is deliberately *not* here. The trial is ours now and lives in
 * `trialStartedAt`/`trialEndsAt`; a Bachs subscription sitting in `trialing` is
 * a leftover from the old model, and treating it as paid is how an account was
 * entitled to Pro before paying anything.
 */
export const LIVE_SUBSCRIPTION_STATUSES = new Set(["active", "past_due"]);

/**
 * True when money is actually in and still covering the current period.
 *
 * Pro ends at the *later* of the two things that were paid for: the subscription
 * period, and any one-time purchase. Someone who subscribes and then buys three
 * extra months is entitled to all of it, and someone who lets a subscription
 * lapse while a one-time term runs on still has that term.
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
  const live = LIVE_SUBSCRIPTION_STATUSES.has(status);
  const keepingPaidPeriod = user.bachsCancelAtPeriodEnd && (live || status === "canceled");

  const ends: number[] = [];
  if ((live || keepingPaidPeriod) && user.bachsCurrentPeriodEnd) {
    ends.push(user.bachsCurrentPeriodEnd.getTime());
  }
  // A one-time purchase has no subscription behind it, just an end date.
  if (user.planExpiresAt) {
    ends.push(user.planExpiresAt.getTime());
  }

  if (ends.length > 0) return Math.max(...ends) > now.getTime();

  // A live subscription whose period end we never recorded still grants access.
  // A missing date must not cost a paying customer their subscription — the
  // opposite mistake, keeping Pro off after a real lapse, is recoverable by
  // re-syncing from Bachs, whereas this one shows a customer who paid nothing.
  return live || keepingPaidPeriod;
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