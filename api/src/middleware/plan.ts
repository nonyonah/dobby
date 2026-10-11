import { prisma } from "../lib/prisma.js";
import { AppError } from "./errors.js";
import { TRIAL_DAYS, entitlementSelect, getEntitlement, type EntitlementRow } from "../lib/entitlement.js";

export { TRIAL_DAYS, trialWindowFrom } from "../lib/entitlement.js";

/**
 * Plan gating.
 *
 * This file holds the guards — who may connect a wallet, who may touch a paid
 * surface — and nothing else. The question of what an account is entitled to is
 * answered by `getEntitlement`, in `lib/entitlement`, and is asked the same way
 * from every call site.
 *
 * It used to be answered here too, as `computeEffectivePlan`, and a second time
 * in the client as `plan === "TRIAL" || plan === "ACTIVE"`. Two copies of one
 * rule is how an account came to be offered an upgrade by the app while the API
 * was granting the same feature for free.
 */

/** The three shapes the rest of the API still speaks in. */
export type EffectivePlan = "TRIAL" | "ACTIVE" | "EXPIRED";

/** Reads entitlement for a user. A thin wrapper, kept for existing callers. */
export async function loadEffectivePlan(
  clerkId: string,
): Promise<{ plan: EffectivePlan; trialStartedAt: Date | null; trialEndsAt: Date | null }> {
  const user = await prisma.user.findUnique({ where: { clerkId }, select: entitlementSelect });
  const entitlement = getEntitlement(user);
  return {
    plan: entitlement.isPro ? (entitlement.status === "trial" ? "TRIAL" : "ACTIVE") : "EXPIRED",
    trialStartedAt: user?.trialStartedAt ?? null,
    trialEndsAt: entitlement.trialEndsAt,
  };
}

/** Wallets a free account may connect. Pro is unlimited. */
export const FREE_WALLET_LIMIT = 1;

/**
 * Whether an account is subject to the free-tier wallet cap.
 *
 * Only one without Pro. The cap used to key off `plan === "ACTIVE"`, which read
 * a trial as free — so a trial user was offered the Connect button and then
 * refused by the API.
 */
export function walletLimitApplies(entitlement: { isPro: boolean }): boolean {
  return !entitlement.isPro;
}

/**
 * The wallet-cap decision, given the account row and how many wallets it holds.
 *
 * Pure, so the rule can be checked without a database — the alternative was a
 * test that reimplemented the gate, which passes whether or not it is right.
 */
export function assertWalletCapacityFor(user: EntitlementRow, existing: number): void {
  if (!walletLimitApplies(getEntitlement(user))) return;
  if (existing < FREE_WALLET_LIMIT) return;
  throw new AppError(
    402,
    `The free tier tracks ${FREE_WALLET_LIMIT} wallet. Remove this one to connect a different address, or upgrade to Dobby Pro to track them all.`,
    "UPGRADE_REQUIRED",
  );
}

/**
 * Throws unless the account can add one more wallet.
 *
 * Reads and deletions are never gated, so a wallet on the free tier can always
 * be inspected or removed (which frees the slot again).
 */
export async function assertWalletCapacity(userId: string | undefined): Promise<void> {
  if (!userId) {
    throw new AppError(401, "Authentication is required.", "UNAUTHENTICATED");
  }
  const [user, existing] = await Promise.all([
    prisma.user.findUnique({ where: { clerkId: userId }, select: entitlementSelect }),
    prisma.walletAccount.count({ where: { ownerClerkId: userId } }),
  ]);
  if (!user) {
    throw new AppError(401, "Authentication is required.", "UNAUTHENTICATED");
  }
  assertWalletCapacityFor(user, existing);
}

/**
 * Throws unless the signed-in account currently has Pro access.
 *
 * Call it as the first line of a gated handler rather than as route
 * middleware: Express infers `req.params` types from the route signature, and an
 * extra middleware argument degrades them.
 *
 * Read-only endpoints that only report state (ledger, history, connection
 * status lists, disconnect) stay ungated so free accounts can always see what
 * they already have and never feel locked out of their own data.
 */
export async function assertPro(userId: string | undefined, feature: string): Promise<void> {
  if (!userId) {
    throw new AppError(401, "Authentication is required.", "UNAUTHENTICATED");
  }
  const user = await prisma.user.findUnique({ where: { clerkId: userId }, select: entitlementSelect });
  if (!user) {
    throw new AppError(401, "Authentication is required.", "UNAUTHENTICATED");
  }

  if (getEntitlement(user).isPro) return;

  // Never started a trial: the trial begins the first time someone reaches for
  // a Pro feature, so this is the moment to offer it. Deliberately a different
  // code from an expired trial — the answer here is "start", not "pay", and a
  // client that shows an upgrade prompt here has charged the user a week of
  // trial to satisfy their curiosity.
  if (user.trialStartedAt === null) {
    throw new AppError(
      403,
      `${feature} is part of Dobby Pro. Start your ${TRIAL_DAYS}-day free trial — no card, nothing to cancel.`,
      "TRIAL_NOT_STARTED",
    );
  }

  throw new AppError(
    403,
    `${feature} is paused — your ${TRIAL_DAYS}-day free trial has ended. Everything you have already imported stays visible and untouched; upgrade to Dobby Pro to pick up where you left off.`,
    "UPGRADE_REQUIRED",
  );
}