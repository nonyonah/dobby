import type { ReactNode } from "react";

/**
 * The one message about billing that must not be a toast.
 *
 * A subscription ending is a state the user has to act on, and a toast times out
 * before they have decided what to do about it. Alert rather than toast, at any
 * surface that can reach someone before the term lapses.
 *
 * Thresholds are deliberately generous. The point is to reach someone while
 * there is still time to renew, not to announce it on the day it happens.
 */

export type BillingNoticeStatus = "warning" | "danger";
export type BillingNoticeAction = "renew";

export type BillingNotice = {
  status: BillingNoticeStatus;
  title: ReactNode;
  body: ReactNode;
  action: BillingNoticeAction;
};

export type BillingNoticeInput = {
  plan: "TRIAL" | "ACTIVE" | "EXPIRED" | null;
  trialEndsAt?: string | null;
  /** Present where `/v1/billing` has been fetched, e.g. Settings. */
  subscription?: { cancelAtPeriodEnd?: boolean | null; currentPeriodEnd?: string | null; status?: string | null } | null;
  /** Injectable clock so the derivation stays testable and hydration-safe. */
  now: number;
  formatDate: (iso: string) => string | null;
};

export function daysUntil(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const days = Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
  return days >= 0 ? days : null;
}

const plural = (days: number) => `${days} ${days === 1 ? "day" : "days"}`;

export function deriveBillingNotice(input: BillingNoticeInput): BillingNotice | null {
  const { plan, trialEndsAt, subscription, now, formatDate } = input;

  if (plan === "EXPIRED") {
    return {
      status: "danger",
      title: "Your free trial has ended",
      body: "Nothing was deleted — imports, categorization and your ledger stay free forever. Upgrade to Pro for email auto-fetch, stablecoin wallets and tax advisory.",
      action: "renew",
    };
  }

  if (subscription?.cancelAtPeriodEnd) {
    const days = daysUntil(subscription.currentPeriodEnd, now);
    return {
      status: "warning",
      title: subscription.currentPeriodEnd
        ? days !== null && days <= 7
          ? `Your subscription ends in ${plural(days)}`
          : `Your subscription ends ${formatDate(subscription.currentPeriodEnd) ?? "at the end of the period"}`
        : "Your subscription is set to end",
      body: "Pro stays active until then, so nothing is lost yet. Renew to keep every feature running without interruption.",
      action: "renew",
    };
  }

  if (plan === "TRIAL") {
    const days = daysUntil(trialEndsAt, now);
    if (days !== null && days <= 3) {
      return {
        status: "warning",
        title: days === 0 ? "Your trial ends today" : `Your trial ends in ${plural(days)}`,
        body: "Every Pro feature is unlocked until then, with no card on file. Upgrade to keep them.",
        action: "renew",
      };
    }
  }

  return null;
}
