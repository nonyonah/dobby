import { Router } from "express";
import { clerkClient } from "@clerk/express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { AppError } from "../middleware/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";
import { SUBSCRIPTION_PRICE_ANCHORS, billingConfigured, cancelProSubscription, createPortalSession, createProCheckout, retrieveSubscriptionOrNull, verifyBachsSignature, type BillingInterval, type SubscriptionState } from "../lib/bachs.js";
import { loadEffectivePlan } from "../middleware/plan.js";
import { entitlementSelect, getEntitlement, trialWindowFrom, type EntitlementRow } from "../lib/entitlement.js";
import { notifyTrialStarted } from "../lib/mailer.js";

const WEBHOOK_PATH = "/webhook";

/**
 * Webhook receiver. Mounted before `express.json` so `req.body` is still the
 * raw Buffer the signature is computed over; no Clerk auth because Bachs calls
 * us, not the user.
 */
export const billingWebhookRouter = Router();

/** Subscription states that keep a paid account on Pro. */
const PAID_STATUSES = new Set(["active", "past_due"]);

type SubscriptionData = {
  subscription_id?: string;
  status?: string;
  product_id?: string;
  metadata?: Record<string, unknown>;
  /** Bachs sends the customer record as `{ id, email, name }` — the key is `id`, not `customer_id`. */
  customer?: { id?: string | null; email?: string; name?: string };
  /**
   * What the buyer actually supplied, present whenever an identity was collected
   * even when no `cust_` record was created. A guest checkout carries the email
   * here and leaves `customer` null, so this is the reliable address to match on.
   */
  customer_details?: { email?: string; name?: string };
  trial_end?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
};

async function findUserForSubscription(data: SubscriptionData) {
  const conditions: Array<Record<string, unknown>> = [];
  const clerkId = typeof data.metadata?.clerk_user_id === "string" ? data.metadata.clerk_user_id : undefined;
  const email = data.customer_details?.email?.trim() || data.customer?.email?.trim();
  const customerId = data.customer?.id ?? undefined;

  if (clerkId) conditions.push({ clerkId });
  if (email) conditions.push({ email: { equals: email, mode: "insensitive" as const } });
  if (data.subscription_id) conditions.push({ bachsSubscriptionId: data.subscription_id });
  if (customerId) conditions.push({ bachsCustomerId: customerId });
  if (conditions.length === 0) return null;

  return prisma.user.findFirst({ where: { OR: conditions } });
}

/** Mirrors a Bachs subscription onto the local user: plan, ids, and renewal state. */
async function applySubscription(data: SubscriptionData, eventType: string) {
  const user = await findUserForSubscription(data);
  if (!user) {
    logger.warn({ eventType, subscriptionId: data.subscription_id }, "bachs subscription has no matching user");
    return false;
  }

  // Bachs no longer knows about trials — the trial is ours now — so every
  // subscription event here is money, and the status is derived from what the
  // subscription is doing rather than mapped onto a trial/active pair.
  const status = data.status ?? "active";
  const plan = statusForSubscription(user, status);

  await prisma.user.update({
    where: { clerkId: user.clerkId },
    data: {
      planStatus: plan,
      bachsCustomerId: data.customer?.id ?? user.bachsCustomerId,
      bachsSubscriptionId: data.subscription_id ?? user.bachsSubscriptionId,
      bachsSubscriptionStatus: status,
      bachsTrialEnd: data.trial_end ? new Date(data.trial_end) : user.bachsTrialEnd,
      bachsCurrentPeriodEnd: data.current_period_end ? new Date(data.current_period_end) : user.bachsCurrentPeriodEnd,
      bachsCancelAtPeriodEnd: data.cancel_at_period_end ?? user.bachsCancelAtPeriodEnd,
    },
  });

  // Idempotent by construction: the write is a plain assignment of the event's
  // own state, so replaying the same event twice lands on the same row. The
  // entitlement is re-read afterwards rather than recomputed here, so a replay
  // cannot hand out a second trial.
  const entitlement = getEntitlement(
    await prisma.user.findUnique({ where: { clerkId: user.clerkId }, select: entitlementSelect }),
  );
  logger.info({ clerkId: user.clerkId, eventType, status, plan, isPro: entitlement.isPro }, "bachs subscription applied");

  return true;
}

/** The stored status for a subscription in this state. */
function statusForSubscription(user: EntitlementRow, status: string) {
  if (status === "past_due") return "past_due" as const;
  if (status === "canceled") return "canceled" as const;
  if (status === "unpaid") return "past_due" as const;
  // A payment that came through always outranks whatever the stored value was:
  // the customer has money in, and `getEntitlement` decides access from that.
  return "pro" as const;
}

async function cancelSubscription(data: SubscriptionData) {
  const user = await findUserForSubscription(data);
  if (!user) {
    logger.warn({ subscriptionId: data.subscription_id }, "canceled bachs subscription has no matching user");
    return false;
  }

  await prisma.user.update({
    where: { clerkId: user.clerkId },
    data: {
      // A cancel stops the subscription; it does not touch a trial window the
      // user started themselves, so `planStatus` records the subscription and
      // `getEntitlement` still answers from the trial if one is running.
      planStatus: data.cancel_at_period_end ? "pro" : "canceled",
      bachsSubscriptionStatus: "canceled",
      // Mirrors how it actually ended. Hard-coding true here made an
      // immediately-cancelled subscription look like it was still winding down.
      bachsCancelAtPeriodEnd: data.cancel_at_period_end ?? false,
      ...(data.current_period_end ? { bachsCurrentPeriodEnd: new Date(data.current_period_end) } : {}),
    },
  });

  logger.info({ clerkId: user.clerkId, subscriptionId: user.bachsSubscriptionId }, "bachs subscription canceled");
  return true;
}

billingWebhookRouter.post(WEBHOOK_PATH, async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}), "utf8");

  const header = (name: string) => {
    const value = req.headers[name];
    return Array.isArray(value) ? value[0] : value;
  };

  if (!env.BACHS_WEBHOOK_SECRET) {
    throw new AppError(503, "Bachs webhook secret is not configured.", "BILLING_NOT_CONFIGURED");
  }

  const valid = verifyBachsSignature({
    rawBody,
    signatureV2: header("x-bachs-signature-v2"),
    signature: header("x-bachs-signature"),
    timestamp: header("x-bachs-timestamp"),
  });

  if (!valid) {
    throw new AppError(401, "Invalid Bachs webhook signature.", "INVALID_WEBHOOK_SIGNATURE");
  }

  let event: { id?: string; type?: string; data?: SubscriptionData };
  try {
    event = JSON.parse(rawBody.toString("utf8")) as typeof event;
  } catch {
    throw new AppError(400, "Webhook body was not valid JSON.", "INVALID_WEBHOOK_PAYLOAD");
  }

  const data = event.data ?? {};
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await applySubscription(data, event.type);
      break;
    case "customer.subscription.deleted":
      await cancelSubscription(data);
      break;
    default:
      // `collection.succeeded` and `invoice.paid` also fire on a subscription
      // checkout. They carry the charge, not the entitlement, and the
      // subscription events above are what grant and revoke Pro — fulfilling
      // from a payment event would double-grant across a plan change.
      logger.info({ eventId: event.id, eventType: event.type }, "bachs webhook handled by the subscription events");
  }

  // Always acknowledge, and only after the row is written. Bachs retries
  // unacknowledged deliveries, so a slow handler turns one event into a queue
  // of duplicates; every write above is an assignment of the event's own state,
  // so applying the same event twice lands on the same row.
  res.json({ received: true });
});

export const billingRouter = Router();
billingRouter.use(requireAuth);

/** Statuses that mean Bachs and the stored row already agree. */
const SETTLED_STATUSES = new Set(["active", "trialing", "past_due"]);

/** The user columns the billing read and the re-sync both need. */
type BillingRow = EntitlementRow & {
  clerkId: string;
  trialStartedAt: Date | null;
  bachsCustomerId: string | null;
  bachsSubscriptionId: string | null;
  bachsSubscriptionStatus: string | null;
  bachsTrialEnd: Date | null;
  bachsCurrentPeriodEnd: Date | null;
  bachsCancelAtPeriodEnd: boolean;
  planExpiresAt: Date | null;
};

const billingRowSelect = {
  clerkId: true,
  ...entitlementSelect,
  bachsCustomerId: true,
  bachsSubscriptionId: true,
  bachsSubscriptionStatus: true,
  bachsTrialEnd: true,
  bachsCurrentPeriodEnd: true,
  bachsCancelAtPeriodEnd: true,
  planExpiresAt: true,
} as const;

/**
 * Brings a stored subscription back in line with Bachs before answering.
 *
 * The webhook is the normal path, but it is a delivery rather than a
 * guarantee. A missing webhook secret, a deploy mid-flight, or an event whose
 * subscription did not match a user yet all freeze the row — and the visible
 * symptom is a customer stuck on a trial: features they paid for stay locked,
 * or a $0.00 trial that never becomes the subscription they started.
 *
 * Deliberately narrow. It calls Bachs only when the stored state says something
 * is wrong — no subscription recorded, a status that is not one of the live
 * ones, or a trial whose end date has passed — so a healthy paid account costs
 * no upstream call at all. A lookup that fails leaves the stored row untouched:
 * a rate-limited or unreachable Bachs must never make the plan worse than we
 * already believe it to be.
 */
async function reconcileSubscription(user: BillingRow | null): Promise<BillingRow | null> {
  if (!user?.bachsSubscriptionId) return user;
  const status = user.bachsSubscriptionStatus ?? "";
  const trialOverdue = status === "trialing" && user.bachsTrialEnd !== null && user.bachsTrialEnd.getTime() <= Date.now();
  if (SETTLED_STATUSES.has(status) && !trialOverdue) return user;

  let live: SubscriptionState | null;
  try {
    live = await retrieveSubscriptionOrNull(user.bachsSubscriptionId);
  } catch (error) {
    // Bachs unreachable or rate-limited. Keeping the stored row is the safe
    // direction: a transient failure must not cost an account its entitlement.
    logger.warn(
      { subscriptionId: user.bachsSubscriptionId, error: error instanceof Error ? error.message : String(error) },
      "could not re-sync subscription from Bachs; keeping stored state",
    );
    return user;
  }

  // Bachs has no record of this subscription. The row is describing something
  // that is not there — which is exactly how a customer ends up looking at a
  // live trial, and a plan page reading $0.00, for a subscription that ended,
  // was reset, or was never really created. Recorded as terminal so the local
  // clock decides again instead of the phantom keeping Pro open indefinitely.
  if (live === null) {
    if (status === "canceled") return user;
    logger.warn({ subscriptionId: user.bachsSubscriptionId, was: status }, "Bachs has no record of this subscription; marking it ended");
    return prisma.user.update({
      where: { clerkId: user.clerkId },
      data: { bachsSubscriptionStatus: "canceled" },
      select: billingRowSelect,
    });
  }

  if (!live.status || live.status === status) return user;

  const paid = PAID_STATUSES.has(live.status);
  logger.info({ subscriptionId: user.bachsSubscriptionId, from: status || null, to: live.status }, "re-synced subscription from Bachs");

  return prisma.user.update({
    where: { clerkId: user.clerkId },
    data: {
      bachsSubscriptionStatus: live.status,
      ...(live.status === "trialing" && live.trial_end ? { bachsTrialEnd: new Date(live.trial_end) } : {}),
      ...(live.current_period_end ? { bachsCurrentPeriodEnd: new Date(live.current_period_end) } : {}),
      ...(typeof live.cancel_at_period_end === "boolean" ? { bachsCancelAtPeriodEnd: live.cancel_at_period_end } : {}),
      // A payment is Pro on its own terms. It never starts a trial: the trial is
      // started deliberately by the user, and a subscription must not hand out a
      // second window the user never asked for.
      ...(paid ? { planStatus: "pro" as const } : {}),
    },
    select: billingRowSelect,
  });
}

billingRouter.get("/", async (req, res) => {
  const user = await reconcileSubscription(
    await prisma.user.findUnique({ where: { clerkId: req.auth!.userId }, select: billingRowSelect }),
  );

  const entitlement = getEntitlement(user);
  res.json({
    data: {
      // Sent as-is so the client renders the server's answer rather than
      // re-deriving one from a status string — which is how it used to decide
      // on its own that a trial user was not Pro.
      entitlement,
      plan: entitlement.isPro ? (entitlement.status === "trial" ? "TRIAL" : "ACTIVE") : "EXPIRED",
      trialEndsAt: entitlement.trialEndsAt,
      configured: billingConfigured(),
      planExpiresAt: user?.planExpiresAt ?? null,
      subscription: user?.bachsSubscriptionId
        ? {
            id: user.bachsSubscriptionId,
            status: user.bachsSubscriptionStatus,
            currentPeriodEnd: user.bachsCurrentPeriodEnd,
            cancelAtPeriodEnd: user.bachsCancelAtPeriodEnd,
          }
        : null,
    },
  });
});

type Identity = { email: string | null; firstName: string | null; lastName: string | null };

/**
 * Reads the signed-in identity out of Clerk, or null if Clerk cannot be reached.
 *
 * Best-effort on purpose: an outage at the checkout must not stop someone from
 * paying.
 */
async function readClerkIdentity(clerkId: string, log: typeof logger): Promise<Partial<Identity> | null> {
  try {
    const clerkUser = await clerkClient.users.getUser(clerkId);
    return {
      email: clerkUser.emailAddresses[0]?.emailAddress ?? null,
      firstName: clerkUser.firstName ?? null,
      lastName: clerkUser.lastName ?? null,
    };
  } catch (error) {
    log.warn({ clerkId, err: error }, "clerk user lookup failed");
    return null;
  }
}

/**
 * Combines what Dobby holds with what Clerk reports, keeping whichever has a
 * real value.
 *
 * This exists because of a specific way a user's name was being destroyed. The
 * lookup was gated behind `if (!email)` and assigned with `??`, and neither of
 * those does what it looks like:
 *
 *   - `??` only falls back on null/undefined. Clerk returns an *empty string*
 *     for a blank last name, so `clerkUser.lastName ?? lastName` overwrote a
 *     real surname with "" and then persisted it. A name typed into Dobby was
 *     wiped on the way to checkout, which is also the name sent to Bachs — so
 *     the customer was created nameless.
 *   - Gating on `!email` meant a user who already had an email stored never had
 *     their name refreshed from Clerk at all.
 *
 * Blank is treated as absent here, and the stored row only wins when Clerk has
 * nothing to say.
 */
export function mergeIdentity(stored: Identity, fromClerk: Partial<Identity> | null): Identity {
  const usable = (value: string | null | undefined) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed.length > 0 ? trimmed : null;
  };
  return {
    email: usable(fromClerk?.email) ?? usable(stored.email),
    firstName: usable(fromClerk?.firstName) ?? usable(stored.firstName),
    lastName: usable(fromClerk?.lastName) ?? usable(stored.lastName),
  };
}

/**
 * Starts the free trial. No card, no checkout.
 *
 * The trial used to be Bachs' `trial` on the product, which meant a signed-up
 * user held a live subscription before paying anything and every checkout
 * billed $0.00 first. Starting it here makes it a deliberate act with nothing
 * attached to it.
 *
 * Two guards: one trial per account, ever, and a verified email first. The
 * second is the one that matters — an unverified address is free to create, so
 * without it the trial is just a free Pro tier handed to anyone willing to
 * type a throwaway address.
 */
billingRouter.post("/trial", async (req, res) => {
  const clerkId = req.auth!.userId;
  const user = await prisma.user.findUnique({ where: { clerkId }, select: { ...entitlementSelect, trialStartedAt: true } });
  if (!user) throw new AppError(404, "No account found.", "USER_NOT_FOUND");

  // Refuses rather than restarting: a second call must never hand out a fresh
  // window, including from a retry after a network failure.
  if (user.trialStartedAt) {
    const entitlement = getEntitlement(user);
    res.json({ data: { started: false, reason: "ALREADY_STARTED" as const, entitlement } });
    return;
  }

  // Verified address, checked against Clerk — our own row only records that an
  // address exists, not that anyone proved they own it.
  try {
    const clerkUser = await clerkClient.users.getUser(clerkId);
    const verified = clerkUser.emailAddresses.some(
      (address) => address.emailAddress === (user as { email?: string | null }).email || address.verification?.status === "verified",
    );
    if (!verified) {
      throw new AppError(
        403,
        "Verify your email address before starting the free trial.",
        "EMAIL_NOT_VERIFIED",
      );
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.warn({ clerkId, err: error }, "clerk verification check failed");
    throw new AppError(503, "Could not verify your email. Try again in a moment.", "VERIFICATION_UNAVAILABLE");
  }

  const { trialStartedAt, trialEndsAt } = trialWindowFrom();
  await prisma.user.update({
    where: { clerkId },
    data: { trialStartedAt, trialEndsAt, planStatus: "trial" },
    select: entitlementSelect,
  });

  const entitlement = getEntitlement({ ...user, trialStartedAt, trialEndsAt, planStatus: "trial" });
  await notifyTrialStarted(clerkId, "trial").catch(() => undefined);
  res.status(201).json({ data: { started: true, entitlement } });
});

billingRouter.post("/checkout", async (req, res) => {
  const input = z.object({
    interval: z.enum(["month", "year"]).default("month"),
  }).parse(req.body ?? {});
  const interval: BillingInterval = input.interval;

  const clerkId = req.auth!.userId;
  const user = await prisma.user.upsert({
    where: { clerkId },
    create: { clerkId, profile: { create: {} } },
    update: {},
    select: { email: true, firstName: true, lastName: true },
  });

  const merged = mergeIdentity(user, await readClerkIdentity(clerkId, logger));
  let { email, firstName, lastName } = merged;
  if (email !== user.email || firstName !== user.firstName || lastName !== user.lastName) {
    await prisma.user.update({ where: { clerkId }, data: { email, firstName, lastName } });
  }

  if (!email) {
    throw new AppError(400, "Add an email address to your account before upgrading.", "EMAIL_REQUIRED");
  }

  // Already paying: hand them the portal instead of minting a second
  // subscription. Two checkouts means two renewals, and the second one charges a
  // card the customer never expected to be charged again.
  const existing = await prisma.user.findUnique({ where: { clerkId }, select: { ...entitlementSelect, bachsCustomerId: true } });
  const entitlement = getEntitlement(existing);
  const status = existing?.bachsSubscriptionStatus ?? "";
  const alreadyPaying =
    (status === "active" || status === "past_due" || status === "trialing") &&
    (entitlement.isPro || status === "trialing");
  if (alreadyPaying) {
    if (!existing?.bachsCustomerId) {
      throw new AppError(409, "This account already has a subscription. Contact support to change it.", "ALREADY_SUBSCRIBED");
    }
    const portal = await createPortalSession(existing.bachsCustomerId);
    res.status(200).json({ data: { alreadySubscribed: true, portalUrl: portal.url, checkoutId: null, url: null } });
    return;
  }

  const name = [firstName, lastName].filter(Boolean).join(" ") || undefined;
  const session = await createProCheckout({ email, name, clerkUserId: clerkId, interval });

  res.status(201).json({ data: { checkoutId: session.checkout_id, url: session.checkout_url } });
});

billingRouter.post("/portal", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { clerkId: req.auth!.userId },
    select: { bachsCustomerId: true },
  });

  if (!user?.bachsCustomerId) {
    throw new AppError(400, "No billing profile exists for this account yet.", "NO_BILLING_PROFILE");
  }

  const session = await createPortalSession(user.bachsCustomerId);
  res.json({ data: { id: session.id, url: session.url } });
});

billingRouter.post("/cancel", async (req, res) => {
  const clerkId = req.auth!.userId;
  // Immediate unless asked otherwise. Period-end is kept available because
  // there are reasons to want it, but it must be a choice rather than what a
  // plain Cancel quietly does.
  const input = z.object({ atPeriodEnd: z.boolean().optional() }).parse(req.body ?? {});
  const atPeriodEnd = input.atPeriodEnd ?? false;
  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { bachsSubscriptionId: true, bachsSubscriptionStatus: true },
  });

  if (!user?.bachsSubscriptionId) {
    throw new AppError(400, "There is no subscription to cancel on this account.", "NO_SUBSCRIPTION");
  }
  if (user.bachsSubscriptionStatus === "canceled" || user.bachsSubscriptionStatus === "canceling") {
    throw new AppError(400, "This subscription is already canceled.", "ALREADY_CANCELED");
  }

  const subscription = await cancelProSubscription(user.bachsSubscriptionId, { atPeriodEnd });

  // Mirror what Bachs answered, but leave the plan alone: an end-of-period
  // cancel keeps the account on Pro until `customer.subscription.deleted`.
  await prisma.user.update({
    where: { clerkId },
    data: {
      ...(subscription.status ? { bachsSubscriptionStatus: subscription.status } : {}),
      bachsCancelAtPeriodEnd: subscription.cancel_at_period_end ?? atPeriodEnd,
      ...(subscription.current_period_end ? { bachsCurrentPeriodEnd: new Date(subscription.current_period_end) } : {}),
    },
  });

  logger.info({ clerkId, subscriptionId: user.bachsSubscriptionId, atPeriodEnd }, "bachs subscription canceled");
  res.json({
    data: {
      cancelAtPeriodEnd: subscription.cancel_at_period_end ?? atPeriodEnd,
      // Immediate cancellation clears the period, so there is no date left to
      // keep the user on until. Sending the old one would tell them Pro runs to
      // a date that no longer applies.
      currentPeriodEnd: atPeriodEnd ? subscription.current_period_end ?? null : null,
    },
  });
});

// ---------------------------------------------------------------------------
// Pricing options (Bachs per-country pricing)
// ---------------------------------------------------------------------------
export type BillingOption = {
  provider: "bachs";
  interval: BillingInterval;
  amount: number;
  currency: string;
  label: string;
  /** Bachs converts to the customer's own currency when the checkout opens. */
  pricing: "local";
};

const usd = (interval: BillingInterval) => Number(SUBSCRIPTION_PRICE_ANCHORS[interval]);
const label = (interval: BillingInterval) =>
  interval === "month" ? `$${usd(interval)}/mo` : `$${usd(interval).toFixed(2)}/yr`;

const CARD_OPTIONS: BillingOption[] = (["month", "year"] as const).map((interval) => ({
  provider: "bachs",
  interval,
  amount: usd(interval),
  currency: "USD",
  label: label(interval),
  pricing: "local",
}));

billingRouter.get("/options", async (_req, res) => {
  // Bachs resolves the customer's currency itself at checkout — a currency set
  // on the product wins, then adaptive conversion, then the USD primary — so
  // there is no region logic here to drift from the catalog. The USD amounts are
  // display anchors for the pills, not the amount charged: the catalog product
  // behind BACHS_PRO_*_PRODUCT_ID owns the real price.
  res.json({
    data: {
      region: null,
      options: billingConfigured() ? CARD_OPTIONS : [],
    },
  });
});
