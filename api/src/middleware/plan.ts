import { prisma } from "../lib/prisma.js";
import { AppError } from "./errors.js";

/** Length of the free trial granted at sign-up. No payment card is collected. */
export const TRIAL_DAYS = 7;
const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

/** What the account is right now, after applying the trial clock. */
export type EffectivePlan = "TRIAL" | "ACTIVE" | "EXPIRED";

type PlanRow = {
  plan: string;
  trialStartedAt: Date | null;
  bachsSubscriptionStatus?: string | null;
  bachsTrialEnd?: Date | null;
  /** Term end for one-time purchases (e.g. a crypto checkout). Null for subscriptions/trials. */
  planExpiresAt?: Date | null;
};

/**
 * Whether the signup trial clock is still running, independent of any
 * stored plan or purchase. Cancelling or lapsing a paid term must fall back
 * to this — never force-expire an account whose trial is still live.
 */
export function isTrialLive(trialStartedAt: Date | null): boolean {
  if (!trialStartedAt) return false;
  return Date.now() - trialStartedAt.getTime() < TRIAL_MS;
}

/**
 * The signup clock alone: a 7-day window from `trialStartedAt`, ignoring any
 * subscription state. EXPIRED is terminal; TRIAL expires lazily once
 * `trialStartedAt + 7 days` has passed, so expiry is computed rather than
 * pre-written and a back-dated row still fails closed.
 */
export function computeLocalPlan(user: PlanRow): EffectivePlan {
  if (user.plan === "ACTIVE") return "ACTIVE";
  if (user.plan === "EXPIRED") return "EXPIRED";
  const started = user.trialStartedAt?.getTime();
  if (!started) return "EXPIRED";
  return Date.now() - started >= TRIAL_MS ? "EXPIRED" : "TRIAL";
}

/**
 * Resolves the stored plan against the subscription and the trial clock.
 *
 * Bachs is the source of truth once a subscription exists: `trialing` means
 * the free period is the product's own `trial_period` (so it stays a trial
 * even after the signup window lapses), and `active`/`past_due` keeps a paid
 * account on Pro through a failed renewal attempt. Otherwise the local
 * signup clock decides.
 */
export function computeEffectivePlan(user: PlanRow): EffectivePlan {
  const status = user.bachsSubscriptionStatus;
  if (status === "trialing") return "TRIAL";
  if (status === "active" || status === "past_due") return "ACTIVE";
  // One-time terms (e.g. crypto) lapse on their own clock, independent of the
  // signup trial: a stored ACTIVE with a past term end is EXPIRED.
  if (user.planExpiresAt && user.planExpiresAt.getTime() <= Date.now()) {
    // A lapsed one-time term falls back to the signup trial clock — it never
    // force-expires an account whose trial is still running.
    return computeLocalPlan({ ...user, plan: "TRIAL" });
  }
  return computeLocalPlan(user);
}

/** Date the trial lapses (null when the row has no trial clock). */
export function trialEndsAt(user: PlanRow): Date | null {
  const local = user.trialStartedAt ? new Date(user.trialStartedAt.getTime() + TRIAL_MS) : null;
  if (user.bachsSubscriptionStatus === "trialing") return user.bachsTrialEnd ?? local;
  return local;
}

/**
 * Reads the user's plan and persists EXPIRED the first time a lapsed trial
 * is observed, so the stored enum catches up with the computed clock.
 */
export async function loadEffectivePlan(
  clerkId: string,
): Promise<{ plan: EffectivePlan; trialStartedAt: Date | null; trialEndsAt: Date | null }> {
  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { plan: true, trialStartedAt: true, bachsSubscriptionStatus: true, bachsTrialEnd: true, planExpiresAt: true },
  });
  if (!user) return { plan: "EXPIRED", trialStartedAt: null, trialEndsAt: null };

  const plan = computeEffectivePlan(user);
  if (plan === "EXPIRED" && user.plan !== "EXPIRED") {
    await prisma.user
      .update({ where: { clerkId }, data: { plan: "EXPIRED" } })
      .catch(() => undefined);
  }
  return { plan, trialStartedAt: user.trialStartedAt, trialEndsAt: trialEndsAt(user) };
}

/** Wallets a free account may connect. Pro is unlimited. */
export const FREE_WALLET_LIMIT = 1;

/**
 * Throws unless the account can add one more wallet.
 *
 * Wallet tracking stays reachable on the free tier — up to a single address —
 * so a lapsed trial does not strand someone who connected a wallet while it
 * was running. Pro removes the cap. Reads and deletions are never gated, so
 * the one free wallet can always be inspected or removed (which frees the
 * slot again).
 */
export async function assertWalletCapacity(userId: string | undefined): Promise<void> {
  if (!userId) {
    throw new AppError(401, "Authentication is required.", "UNAUTHENTICATED");
  }
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { plan: true, trialStartedAt: true, bachsSubscriptionStatus: true, bachsTrialEnd: true, planExpiresAt: true },
  });
  if (!user) {
    throw new AppError(401, "Authentication is required.", "UNAUTHENTICATED");
  }

  if (computeEffectivePlan(user) === "ACTIVE") return;

  const existing = await prisma.walletAccount.count({ where: { ownerClerkId: userId } });
  if (existing < FREE_WALLET_LIMIT) return;

  throw new AppError(
    402,
    `The free tier tracks ${FREE_WALLET_LIMIT} wallet. Remove this one to connect a different address, or upgrade to Dobby Pro to track them all.`,
    "UPGRADE_REQUIRED",
  );
}

/**
 * Throws unless the signed-in account currently has Pro access — an active
 * subscription or a trial still inside its 7-day window.
 *
 * Call it as the first line of a gated handler rather than as route
 * middleware: Express infers `req.params` types from the route signature, and
 * an extra middleware argument degrades them. Accounts whose trial has lapsed
 * get a 403 with `UPGRADE_REQUIRED` and a plain-language message that makes
 * clear their data is safe and still visible, so the client can show an
 * upgrade prompt instead of a generic failure.
 *
 * Read-only endpoints that only report state (ledger, history, connection
 * status lists, disconnect) stay ungated so expired accounts can always see
 * what they already have and never feel locked out of their own data.
 */
export async function assertPro(userId: string | undefined, feature: string): Promise<void> {
  if (!userId) {
    throw new AppError(401, "Authentication is required.", "UNAUTHENTICATED");
  }
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { plan: true, trialStartedAt: true, bachsSubscriptionStatus: true, bachsTrialEnd: true, planExpiresAt: true },
  });
  if (!user) {
    throw new AppError(401, "Authentication is required.", "UNAUTHENTICATED");
  }

  const plan = computeEffectivePlan(user);
  if (plan === "EXPIRED") {
    if (user.plan !== "EXPIRED") {
      await prisma.user
        .update({ where: { clerkId: userId }, data: { plan: "EXPIRED" } })
        .catch(() => undefined);
    }
    throw new AppError(
      403,
      `${feature} is paused — your ${TRIAL_DAYS}-day free trial has ended. Everything you have already imported stays visible and untouched; upgrade to Dobby Pro to pick up where you left off.`,
      "UPGRADE_REQUIRED",
    );
  }
}
