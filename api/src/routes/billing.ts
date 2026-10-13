import { Router } from "express";
import crypto from "node:crypto";
import { clerkClient } from "@clerk/express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { AppError } from "../middleware/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";
import { SUBSCRIPTION_PRICE_ANCHORS, bachsFetch, billingConfigured, cancelProSubscription, createOneTimeCheckout, createPortalSession, createProCheckout, logMissingPaymentMethods, retrieveSubscriptionOrNull, verifyBachsSignature, warnIfOneTimeUnavailable, type BillingInterval, type PlanPrice, type SubscriptionState } from "../lib/bachs.js";
import { loadEffectivePlan } from "../middleware/plan.js";
import { entitlementSelect, getEntitlement, trialWindowFrom, type EntitlementRow } from "../lib/entitlement.js";
import { TRIAL_CONVERTED, TRIAL_STARTED, recordTrialEvent } from "../billing/trial-events.js";
import { notifyTrialStarted } from "../lib/mailer.js";
import { sendTrialAlert } from "../lib/mailer.js";
import { appUrl, publicAppUrl } from "../emails/links.js";
import {
  ONE_TIME_PROVIDER,
  addMonths,
  fulfilOneTimePayment,
  handleRefund,
  handleUnderpaid,
  newOneTimeReference,
  type OneTimeEventData,
} from "../billing/one-time.js";

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

  let event: { id?: string; type?: string; data?: SubscriptionData & OneTimeEventData };
  try {
    event = JSON.parse(rawBody.toString("utf8")) as typeof event;
  } catch {
    throw new AppError(400, "Webhook body was not valid JSON.", "INVALID_WEBHOOK_PAYLOAD");
  }

  const type = event.type ?? "";

  // Idempotency, before anything else. `collection.succeeded` and
  // `checkout.completed` describe the same single payment and either may arrive
  // first, and Bachs retries anything not answered 2xx — so a duplicate delivery
  // is normal traffic, not an edge case. Inserting the event id first means a
  // repeat loses the race and returns without doing any work.
  //
  // An event with no id cannot be deduplicated, so it is recorded under a value
  // that can never collide and handled normally.
  const eventId = event.id ?? `evt_no_id_${crypto.randomUUID()}`;
  const claimed = await prisma.webhookEvent
    .create({ data: { eventId, type }, select: { id: true } })
    .then(() => true)
    .catch(() => false);

  if (!claimed) {
    logger.info({ eventId, eventType: type }, "bachs webhook redelivered; already recorded");
    res.json({ received: true, duplicate: true });
    return;
  }

  try {
    await dispatchWebhook(type, event.data ?? {}, eventId);
    await prisma.webhookEvent.update({ where: { eventId }, data: { processedAt: new Date() } });
  } catch (error) {
    // Left unprocessed so the event is visible as failed rather than absent.
    // Replayed deliveries are still dropped by the claim above, so a retry has
    // to come from a manual replay — deliberate, because re-running fulfilment
    // on a half-applied event is worse than making someone look at it.
    logger.error({ eventId, eventType: type, err: error }, "bachs webhook handler failed");
  }

  // Always acknowledge, and only after the work is done. Bachs retries
  // unacknowledged deliveries, so a slow handler turns one event into a queue of
  // duplicates; every write here is keyed on the event id or the charge id, so a
  // duplicate that does arrive lands on the same row.
  res.json({ received: true });
});

const isSubscription = (user: { bachsSubscriptionId: string | null } | null) => Boolean(user?.bachsSubscriptionId);

/** Routes one verified event to the code that owns it. */
async function dispatchWebhook(type: string, data: SubscriptionData & OneTimeEventData, eventId: string): Promise<void> {
  const data_ = data;
  switch (type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await applySubscription(data_, type);
      return;
    case "customer.subscription.deleted":
      await cancelSubscription(data_);
      return;
    case "collection.succeeded":
    case "checkout.completed": {
      // Both can fire for one payment, and a subscription checkout emits
      // `collection.succeeded` for its first invoice too. Only the ones with an
      // order of ours behind them are a one-time purchase.
      if (await isSubscriptionPayment(data_)) {
        logger.info({ eventId, eventType: type }, "payment event belongs to a subscription; handled by the subscription events");
        return;
      }
      await fulfilOneTimePayment(data_, type);
      return;
    }
    case "collection.underpaid":
      await handleUnderpaid(data_, type);
      return;
    case "checkout.expired":
      logger.info({ eventId, checkoutId: data_.checkout_id }, "one-time checkout expired; no access granted");
      return;
    case "refund.paid":
      await handleRefund(data_, type);
      return;
    case "invoice.paid":
    case "invoice.payment_failed":
    case "collection.failed":
      // Renewal outcomes. `customer.subscription.updated` carries the
      // resulting status and is what `getEntitlement` reads, so there is nothing
      // to grant or revoke here — but a failure is worth a line in the log.
      logger.info({ eventId, eventType: type, subscriptionId: data_.subscription_id }, "invoice event logged");
      return;
    default:
      logger.info({ eventId, eventType: type }, "bachs webhook type not handled");
  }
}

/**
 * Whether this payment event belongs to a subscription rather than a one-time
 * order.
 *
 * The webhook for a subscription's first payment looks exactly like one for a
 * checkout: same event type, same `collection.succeeded`. The order of the
 * checks matters — an existing subscription id wins, and failing that we look
 * for one of our own pending orders rather than trusting the absence of one.
 */
async function isSubscriptionPayment(data: OneTimeEventData): Promise<boolean> {
  if (typeof data.metadata?.clerk_user_id === "string") {
    const user = await prisma.user.findUnique({
      where: { clerkId: data.metadata.clerk_user_id },
      select: { bachsSubscriptionId: true },
    });
    if (isSubscription(user)) return true;
  }
  if (data.customer?.id) {
    const user = await prisma.user.findUnique({
      where: { bachsCustomerId: data.customer.id },
      select: { bachsSubscriptionId: true },
    });
    if (isSubscription(user)) return true;
  }
  // No subscription anywhere on the account, and no reference of ours: not ours.
  return !data.reference;
}

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

  // Read before the write: conversion is the transition *from* a trial, so it has
  // to be judged against the status that was in force beforehand. Reconciling
  // runs on every billing read, and writing an event each time would turn one
  // conversion into as many events as the user has opened the page.
  const wasOnTrial = user.planStatus === "trial" || user.trialStartedAt !== null;

  const updated = await prisma.user.update({
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

  if (paid && wasOnTrial) {
    await sendTrialAlert({ ownerClerkId: user.clerkId, kind: "converted", startedAt: user.trialStartedAt }).catch(() => undefined);
    await recordTrialEvent(user.clerkId, TRIAL_CONVERTED, {
      // Whether they actually used the trial, as distinct from merely starting
      // it. The two numbers differ a lot and only one of them is a product
      // signal: a trial started and abandoned on day one is not a conversion
      // problem, it is an activation problem.
      usedTrial: user.trialStartedAt !== null,
      fromStatus: status || null,
    });
  }
  return updated;
}

billingRouter.get("/", async (req, res) => {
  const clerkId = req.auth!.userId;
  const user = await reconcileSubscription(
    await prisma.user.findUnique({ where: { clerkId }, select: billingRowSelect }),
  );

  // A short crypto payment is shown back on the Plan page so the customer can
  // see what is outstanding without hunting through their email. Only the most
  // recent one: an older shortfall has either been completed or written off.
  const latestUnderpaid = await prisma.payment.findFirst({
    where: { ownerClerkId: clerkId, provider: ONE_TIME_PROVIDER, status: "underpaid" },
    orderBy: { createdAt: "desc" },
    select: { amount: true, currency: true, shortfall: true, createdAt: true, txRef: true },
  });

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
      // Whether "Pay once" may be offered at all. Hidden for a card subscriber
      // rather than disabled: two ways to hold Pro is two things to forget about,
      // and the one they forgot is the one that charged them.
      oneTime: {
        available: Boolean(billingConfigured()) && !user?.bachsSubscriptionId,
        /** Ends the access a one-time purchase bought, if there was one. */
        paidUntil: user?.planExpiresAt ?? null,
        outstanding: latestUnderpaid,
      },
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
  // Recorded after the write has landed, and never allowed to fail the request:
  // this is a measurement of a trial that has already been granted.
  await recordTrialEvent(clerkId, TRIAL_STARTED, {
    source: "self_serve",
    endsAt: trialEndsAt.toISOString(),
    days: 7,
  });
  // Your inbox, so you know a trial started without opening a dashboard. Sent
  // after the trial is already granted and never allowed to fail it.
  await sendTrialAlert({ ownerClerkId: clerkId, kind: "started", startedAt: trialStartedAt, endsAt: trialEndsAt }).catch(() => undefined);
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

  // Pinned on the user now, so a saved card can attach to an existing customer
  // and a renewal always charges the same customer the card belongs to.
  const customerId = await resolveBachsCustomerId(clerkId, email, name);

  const session = await createProCheckout({
    email,
    name,
    clerkUserId: clerkId,
    customerId,
    price: planPrice(interval),
    successUrl: appUrl("/settings#plan"),
    cancelUrl: appUrl("/settings#plan"),
  });

  // What the customer will be offered depends on the currency they pick on the
  // page: a card for a USD price, transfer or crypto for a local one. Bachs does
  // not return that list over the API, so the session id is logged to tie a
  // report of "the rails were missing" back to the checkout that dropped them.
  logger.info({ clerkId, checkoutId: session.checkout_id, interval, currency: planPrice(interval).currency }, "checkout created");

  res.status(201).json({ data: { checkoutId: session.checkout_id, url: session.checkout_url } });
});

/**
 * Starts a one-time purchase, paid by bank transfer or crypto.
 *
 * A separate checkout from `/checkout` on purpose. Bachs will only ever re-charge
 * a card, so a subscription checkout can show nothing but a card — there is no
 * version of one checkout that offers a recurring card *and* a bank transfer.
 * Two sessions, two buttons, and the customer picks each time.
 *
 * A pending `Payment` row is written before the checkout is opened. It is the
 * link the webhook matches on and the record the fulfilment updates, so nothing
 * is granted to a payment that has no order behind it.
 */
billingRouter.post("/checkout/once", async (req, res) => {
  const clerkId = req.auth!.userId;

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: {
      email: true,
      firstName: true,
      lastName: true,
      bachsCustomerId: true,
      bachsSubscriptionId: true,
      // entitlementSelect already carries the subscription status, period end,
      // cancel flag and one-time expiry.
      ...entitlementSelect,
    },
  });
  if (!user) throw new AppError(404, "No account found.", "USER_NOT_FOUND");

  // A card subscriber is already covered by something that renews on its own.
  // Selling them a second, non-renewing term would take their money for access
  // they already have and would leave them worse off than before.
  if (user.bachsSubscriptionId) {
    const portalUrl = user.bachsCustomerId ? (await createPortalSession(user.bachsCustomerId)).url : null;
    res.status(200).json({ data: { alreadySubscribed: true, portalUrl, url: null, checkoutId: null } });
    return;
  }

  const merged = mergeIdentity(user, await readClerkIdentity(clerkId, logger));
  const { email, firstName, lastName } = merged;
  if (email !== user.email || firstName !== user.firstName || lastName !== user.lastName) {
    await prisma.user.update({ where: { clerkId }, data: { email, firstName, lastName } });
  }
  if (!email) {
    throw new AppError(400, "Add an email address to your account before upgrading.", "EMAIL_REQUIRED");
  }

  // Says plainly what is wrong with the account before a customer reaches a
  // checkout page that cannot take their money. Cheap, and it makes the log
  // traceable to a specific misconfiguration.
  await warnIfOneTimeUnavailable(logger);

  const reference = newOneTimeReference(clerkId);

  // Refused here rather than logged. Bachs rejects a checkout whose
  // `success_url` is not publicly reachable, and that arrives mid-purchase as an
  // opaque upstream error; failing before the session is created says plainly
  // which variable is missing.
  let settingsUrl: string;
  try {
    settingsUrl = publicAppUrl("/settings#plan");
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, "cannot create a Bachs checkout without a public app URL");
    throw new AppError(503, "Checkout is misconfigured on this environment. Please contact support.", "APP_URL_NOT_PUBLIC");
  }

  const name = [firstName, lastName].filter(Boolean).join(" ") || undefined;

  const session = await createOneTimeCheckout({
    email,
    name,
    clerkUserId: clerkId,
    reference,
    successUrl: settingsUrl,
    cancelUrl: settingsUrl,
  });

  // A checkout that quietly dropped a corridor still succeeds. Catch it here,
  // with the session id, rather than letting the customer discover it.
  logMissingPaymentMethods(session, logger);

  await prisma.payment.create({
    data: {
      ownerClerkId: clerkId,
      provider: ONE_TIME_PROVIDER,
      txRef: reference,
      checkoutId: session.checkout_id,
      plan: "once",
      amount: new Prisma.Decimal(SUBSCRIPTION_PRICE_ANCHORS.month),
      currency: "USD",
      status: "pending",
    },
  });

  logger.info({ clerkId, checkoutId: session.checkout_id, reference, offered: session.payment_methods ?? null }, "one-time checkout created");
  res.status(201).json({ data: { checkoutId: session.checkout_id, url: session.checkout_url, reference } });
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

billingRouter.get("/options", async (req, res) => {
  // Bachs resolves the customer's currency itself at checkout — a currency set
  // on the product wins, then adaptive conversion, then the USD primary — so
  // there is no region logic here to drift from the catalog. The USD amounts are
  // display anchors for the pills, not the amount charged: the catalog product
  // behind BACHS_PRO_*_PRODUCT_ID owns the real price.
  //
  // Read straight off the user row with no reconciliation: this only has to know
  // whether a subscription exists, and making a dialog open re-sync a
  // subscription from Bachs to decide what to draw would be a slow way to ask a
  // yes/no question.
  const user = await prisma.user.findUnique({
    where: { clerkId: req.auth!.userId },
    select: { bachsSubscriptionId: true },
  });

  res.json({
    data: {
      region: null,
      options: billingConfigured() ? CARD_OPTIONS : [],
      oneTimeAvailable: billingConfigured() && !user?.bachsSubscriptionId,
    },
  });
});

/**
 * What a plan costs, as a raw amount on the checkout.
 *
 * Currency is the plan's own, USD by default. Everything else — which corridors
 * appear, what the customer is actually charged — is resolved by Bachs from this
 * one value, so this is the only place a price or a currency is decided.
 *
 * A plan must be sold in a currency the account can collect in, and a USD price
 * is the one that converts: with adaptive pricing on, a customer elsewhere is
 * shown their own currency at the rate of the moment. Exact per-currency prices
 * can be set on the product, which is the better place for them than here — the
 * hosted page then shows the same figure everywhere it is opened.
 */
export function planPrice(interval: BillingInterval): PlanPrice {
  const amount = Number(SUBSCRIPTION_PRICE_ANCHORS[interval]).toFixed(2);
  return { amount, currency: "USD", interval };
}

/**
 * The Bachs customer for this account, creating one if needed.
 *
 * Reuse matters for the saved card: `chargeSavedCard` names a customer and a
 * `pm_` id, and a card saved against a throwaway guest customer cannot be
 * re-charged against the record the next renewal looks up. One customer per
 * account, forever.
 */
async function resolveBachsCustomerId(clerkId: string, email: string, name?: string): Promise<string | null> {
  const existing = await prisma.user.findUnique({ where: { clerkId }, select: { bachsCustomerId: true } });
  if (existing?.bachsCustomerId) return existing.bachsCustomerId;

  try {
    const customer = await bachsFetch<{ customer_id: string }>("/v1/customers", {
      method: "POST",
      body: JSON.stringify({ email, ...(name ? { name } : {}) }),
    });
    await prisma.user.update({ where: { clerkId }, data: { bachsCustomerId: customer.customer_id } });
    return customer.customer_id;
  } catch (error) {
    // Not fatal: the checkout still works as a guest, and a bank or crypto
    // payer has no saved card anyway. A card payer whose id we failed to store
    // simply will not auto-renew, which the renewal nudges then explain.
    logger.warn({ clerkId, err: error }, "could not create a bachs customer; checkout will proceed as a guest");
    return null;
  }
}
