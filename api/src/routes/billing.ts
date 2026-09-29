import { Router } from "express";
import { clerkClient } from "@clerk/express";
import { Plan, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { AppError } from "../middleware/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";
import { BACHS_USD_PRICES, billingConfigured, cancelProSubscription, createCryptoCheckout, createPortalSession, createProCheckout, getCheckoutSession, verifyBachsSignature, type BillingInterval } from "../lib/bachs.js";
import { FLUTTERWAVE_PRICES, createFlutterwavePayment, flutterwaveConfigured, flutterwaveWebhookValid, newTxRef, verifyFlutterwaveTransaction, type FlutterwaveInterval, type VerifiedFlutterwaveTransaction } from "../lib/flutterwave.js";
import { computeEffectivePlan, computeLocalPlan, isTrialLive, trialEndsAt } from "../middleware/plan.js";

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
  customer?: { customer_id?: string; email?: string };
  trial_end?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
};

async function findUserForSubscription(data: SubscriptionData) {
  const conditions: Array<Record<string, unknown>> = [];
  const clerkId = typeof data.metadata?.clerk_user_id === "string" ? data.metadata.clerk_user_id : undefined;
  const email = data.customer?.email?.trim();

  if (clerkId) conditions.push({ clerkId });
  if (email) conditions.push({ email: { equals: email, mode: "insensitive" as const } });
  if (data.subscription_id) conditions.push({ bachsSubscriptionId: data.subscription_id });
  if (data.customer?.customer_id) conditions.push({ bachsCustomerId: data.customer.customer_id });
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

  const status = data.status ?? "active";
  // A live subscription wins, `trialing` is a free period the product grants
  // (so it stays a trial), and anything else falls back to whatever the local
  // signup clock still says (keeps a trial alive through a failed payment).
  const plan = PAID_STATUSES.has(status)
    ? Plan.ACTIVE
    : status === "trialing"
      ? Plan.TRIAL
      : computeLocalPlan(user) === "TRIAL"
        ? Plan.TRIAL
        : Plan.EXPIRED;

  await prisma.user.update({
    where: { clerkId: user.clerkId },
    data: {
      plan,
      bachsCustomerId: data.customer?.customer_id ?? user.bachsCustomerId,
      bachsSubscriptionId: data.subscription_id ?? user.bachsSubscriptionId,
      bachsSubscriptionStatus: status,
      bachsTrialEnd: data.trial_end ? new Date(data.trial_end) : user.bachsTrialEnd,
      bachsCurrentPeriodEnd: data.current_period_end ? new Date(data.current_period_end) : user.bachsCurrentPeriodEnd,
      bachsCancelAtPeriodEnd: data.cancel_at_period_end ?? user.bachsCancelAtPeriodEnd,
    },
  });

  logger.info({ clerkId: user.clerkId, eventType, status, plan }, "bachs subscription applied");
  return true;
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
      // A cancelled subscription falls back to the signup trial clock — never
      // force-expire an account whose trial is still running.
      plan: isTrialLive(user.trialStartedAt) ? Plan.TRIAL : Plan.EXPIRED,
      bachsSubscriptionStatus: "canceled",
      bachsCancelAtPeriodEnd: true,
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
    case "checkout.completed":
    case "collection.succeeded": {
      const handled = await applyCryptoCollection(data, event.type);
      if (!handled) logger.info({ eventId: event.id, eventType: event.type }, "bachs crypto event not fulfilled");
      break;
    }
    case "checkout.expired":
    case "collection.failed":
    case "collection.underpaid":
      await failCryptoCollection(data, event.type);
      break;
    default:
      logger.info({ eventId: event.id, eventType: event.type }, "bachs webhook ignored");
  }

  // Always acknowledge: Bachs retries unacknowledged deliveries, and an event we
  // cannot attribute is not made right by replaying it.
  res.json({ received: true });
});

export const billingRouter = Router();
billingRouter.use(requireAuth);

billingRouter.get("/", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { clerkId: req.auth!.userId },
    select: {
      plan: true,
      trialStartedAt: true,
      bachsCustomerId: true,
      bachsSubscriptionId: true,
      bachsSubscriptionStatus: true,
      bachsTrialEnd: true,
      bachsCurrentPeriodEnd: true,
      bachsCancelAtPeriodEnd: true,
      planExpiresAt: true,
    },
  });
  const term = await prisma.payment.findFirst({
    where: { ownerClerkId: req.auth!.userId, provider: { in: ["flutterwave", "bachs"] }, status: "paid" },
    orderBy: { paidAt: "desc" },
    select: { provider: true, plan: true, periodEndsAt: true, currency: true, amount: true },
  });

  res.json({
    data: {
      plan: user ? computeEffectivePlan(user) : "TRIAL",
      trialEndsAt: user ? trialEndsAt(user) : null,
      configured: billingConfigured(),
      planExpiresAt: user?.planExpiresAt ?? null,
      term: term
        ? { provider: "flutterwave", plan: term.plan, periodEndsAt: term.periodEndsAt, amount: term.amount.toString(), currency: term.currency }
        : null,
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

billingRouter.post("/checkout", async (req, res) => {
  const requested = req.body?.interval;
  if (requested !== undefined && requested !== "month" && requested !== "year") {
    throw new AppError(400, 'interval must be "month" or "year".', "VALIDATION_ERROR");
  }
  const method = req.body?.method ?? "card";
  if (method !== "card" && method !== "crypto") {
    throw new AppError(400, 'method must be "card" or "crypto".', "VALIDATION_ERROR");
  }
  const interval: BillingInterval = requested ?? "month";

  const clerkId = req.auth!.userId;
  const user = await prisma.user.upsert({
    where: { clerkId },
    create: { clerkId, profile: { create: {} } },
    update: {},
    select: { email: true, firstName: true, lastName: true },
  });

  let { email, firstName, lastName } = user;
  if (!email) {
    try {
      const clerkUser = await clerkClient.users.getUser(clerkId);
      email = clerkUser.emailAddresses[0]?.emailAddress ?? null;
      firstName = clerkUser.firstName ?? firstName;
      lastName = clerkUser.lastName ?? lastName;
      if (email) {
        await prisma.user.update({ where: { clerkId }, data: { email, firstName, lastName } });
      }
    } catch (error) {
      logger.warn({ clerkId, err: error }, "clerk user lookup failed");
    }
  }

  if (!email) {
    throw new AppError(400, "Add an email address to your account before upgrading.", "EMAIL_REQUIRED");
  }

  const name = [firstName, lastName].filter(Boolean).join(" ") || undefined;
  if (method === "crypto") {
    // One-time crypto term: subscriptions reject non-card methods, so this
    // sells the same cadence as pure pricing and fulfills a 30/365-day term
    // through the shared Payment row (webhook + status poll below).
    const price = BACHS_USD_PRICES[interval];
    const txRef = `dobby-bachs-${Date.now().toString(36)}-${clerkId.slice(-6)}`;
    await prisma.payment.create({
      data: {
        ownerClerkId: clerkId,
        provider: "bachs",
        txRef,
        plan: interval,
        amount: new Prisma.Decimal(price.amount),
        currency: "USD",
        status: "pending",
      },
    });
    const session = await createCryptoCheckout({ email, name, clerkUserId: clerkId, interval, reference: txRef });
    res.status(201).json({ data: { checkoutId: session.checkout_id, url: session.checkout_url } });
    return;
  }
  const session = await createProCheckout({
    email,
    name,
    clerkUserId: clerkId,
    interval,
    method,
  });

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

  const subscription = await cancelProSubscription(user.bachsSubscriptionId);

  // Mirror what Bachs answered, but leave the plan alone: an end-of-period
  // cancel keeps the account on Pro until `customer.subscription.deleted`.
  await prisma.user.update({
    where: { clerkId },
    data: {
      ...(subscription.status ? { bachsSubscriptionStatus: subscription.status } : {}),
      bachsCancelAtPeriodEnd: subscription.cancel_at_period_end ?? true,
      ...(subscription.current_period_end ? { bachsCurrentPeriodEnd: new Date(subscription.current_period_end) } : {}),
    },
  });

  logger.info({ clerkId, subscriptionId: user.bachsSubscriptionId }, "bachs subscription set to cancel");
  res.json({
    data: {
      cancelAtPeriodEnd: subscription.cancel_at_period_end ?? true,
      currentPeriodEnd: subscription.current_period_end ?? null,
    },
  });
});

// ---------------------------------------------------------------------------
// Region-aware options + Flutterwave (NGN one-time Pro terms)
// ---------------------------------------------------------------------------

export type BillingRegion = "NG" | "US";

export type BillingOption = {
  provider: "bachs" | "flutterwave";
  interval: BillingInterval;
  /** Card = Bachs subscription; crypto/Flutterwave = one-time terms. */
  method: "card" | "crypto" | "flutterwave";
  amount: number;
  currency: string;
  label: string;
};

const USD_CARD_OPTIONS: BillingOption[] = [
  { provider: "bachs", interval: "month", method: "card", amount: 5, currency: "USD", label: "$5/mo" },
  { provider: "bachs", interval: "year", method: "card", amount: 50, currency: "USD", label: "$50/yr" },
];

const USD_CRYPTO_OPTIONS: BillingOption[] = [
  { provider: "bachs", interval: "month", method: "crypto", amount: 5, currency: "USD", label: "$5/mo · Crypto" },
  { provider: "bachs", interval: "year", method: "crypto", amount: 50, currency: "USD", label: "$50/yr · Crypto" },
];

function ngnLabel(amount: number, interval: BillingInterval): string {
  const formatted = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount);
  return `${formatted}/${interval === "month" ? "mo" : "yr"}`;
}

function flutterwaveOptions(): BillingOption[] {
  return (Object.keys(FLUTTERWAVE_PRICES) as FlutterwaveInterval[]).map((interval) => ({
    provider: "flutterwave",
    interval,
    method: "flutterwave",
    amount: FLUTTERWAVE_PRICES[interval].amount,
    currency: FLUTTERWAVE_PRICES[interval].currency,
    label: ngnLabel(FLUTTERWAVE_PRICES[interval].amount, interval),
  }));
}

/** The app bills in two regions: NGN (Nigeria) and USD (US). The universal
 * Country setting is authoritative; the tax profile is the fallback. */
export async function billingRegionFor(clerkId: string): Promise<BillingRegion> {
  const [profile, taxProfile] = await Promise.all([
    prisma.profile.findUnique({ where: { clerkId }, select: { country: true } }),
    prisma.taxProfile.findUnique({ where: { ownerClerkId: clerkId }, select: { country: true } }),
  ]);
  const explicit = profile?.country?.toUpperCase();
  if (explicit === "US") return "US";
  if (explicit === "NG") return "NG";
  if (taxProfile?.country === "US") return "US";
  return "NG";
}

billingRouter.get("/options", async (req, res) => {
  const region = await billingRegionFor(req.auth!.userId);
  const card = billingConfigured() ? USD_CARD_OPTIONS : [];
  const crypto = billingConfigured() ? USD_CRYPTO_OPTIONS : [];
  const wave = flutterwaveConfigured() ? flutterwaveOptions() : [];
  // US bills by card subscription or crypto terms; Nigeria bills by
  // Flutterwave or crypto terms. The other configured provider stays as a
  // fallback so checkout never renders empty.
  const primary = region === "NG" ? [...wave, ...crypto] : [...card, ...crypto];
  const fallback = region === "NG" ? [...card, ...crypto] : [...wave, ...crypto];
  const options = primary.length > 0 ? primary : fallback;
  res.json({ data: { region, options } });
});

async function resolveBillingEmail(clerkId: string): Promise<{ email: string; name?: string }> {
  const user = await prisma.user.findUnique({ where: { clerkId }, select: { email: true, firstName: true, lastName: true } });
  let email = user?.email ?? null;
  let firstName = user?.firstName ?? null;
  let lastName = user?.lastName ?? null;
  if (!email) {
    try {
      const clerkUser = await clerkClient.users.getUser(clerkId);
      email = clerkUser.emailAddresses[0]?.emailAddress ?? null;
      firstName = clerkUser.firstName ?? firstName;
      lastName = clerkUser.lastName ?? lastName;
      if (email) await prisma.user.update({ where: { clerkId }, data: { email, firstName, lastName } }).catch(() => undefined);
    } catch (error) {
      logger.warn({ clerkId, err: error }, "clerk user lookup failed");
    }
  }
  if (!email) throw new AppError(400, "Add an email address to your account before upgrading.", "EMAIL_REQUIRED");
  const name = [firstName, lastName].filter(Boolean).join(" ") || undefined;
  return { email, name };
}

billingRouter.post("/flutterwave/checkout", async (req, res) => {
  const interval = z.object({ interval: z.enum(["month", "year"]).default("month") }).parse(req.body).interval;
  if (!flutterwaveConfigured()) {
    throw new AppError(503, "Card and transfer payments are not configured yet.", "FLUTTERWAVE_NOT_CONFIGURED");
  }
  const clerkId = req.auth!.userId;
  const { email, name } = await resolveBillingEmail(clerkId);
  const price = FLUTTERWAVE_PRICES[interval];
  const txRef = newTxRef(clerkId);
  await prisma.payment.create({
    data: {
      ownerClerkId: clerkId,
      provider: "flutterwave",
      txRef,
      plan: interval,
      amount: new Prisma.Decimal(price.amount),
      currency: price.currency,
      status: "pending",
    },
  });
  const redirectUrl = `${env.WEB_ORIGIN}/settings?payment=flutterwave`;
  const payment = await createFlutterwavePayment({ interval, email, name, txRef, redirectUrl });
  res.status(201).json({ data: { link: payment.link, txRef } });
});

/**
 * Fulfill a verified Flutterwave transaction: idempotent on txRef, strict on
 * amount/currency/ownership. Grants a 30/365-day Pro term.
 */
async function fulfillFlutterwavePayment(ownerClerkId: string, verified: VerifiedFlutterwaveTransaction) {
  if (verified.status !== "successful") {
    throw new AppError(402, "The Flutterwave transaction was not successful.", "PAYMENT_NOT_SUCCESSFUL");
  }
  const payment = await prisma.payment.findUnique({ where: { txRef: verified.txRef } });
  if (!payment) throw new AppError(404, "No matching payment request.", "PAYMENT_NOT_FOUND");
  if (payment.ownerClerkId !== ownerClerkId) {
    throw new AppError(403, "This payment belongs to a different account.", "PAYMENT_OWNER_MISMATCH");
  }
  if (payment.status === "paid") return { granted: true, already: true as const, periodEndsAt: payment.periodEndsAt };
  const price = FLUTTERWAVE_PRICES[payment.plan as FlutterwaveInterval];
  if (!price || verified.currency !== price.currency || verified.amount < price.amount) {
    throw new AppError(402, "Paid amount does not match the plan price.", "PAYMENT_AMOUNT_MISMATCH");
  }
  const paidAt = new Date();
  const periodEndsAt = new Date(paidAt.getTime() + price.days * 86_400_000);
  await prisma.payment.update({
    where: { txRef: verified.txRef },
    data: { status: "paid", providerTxId: String(verified.id), paidAt, periodEndsAt },
  });
  await prisma.user.update({ where: { clerkId: ownerClerkId }, data: { plan: Plan.ACTIVE, planExpiresAt: periodEndsAt } });
  logger.info({ clerkId: ownerClerkId, txRef: verified.txRef, plan: payment.plan }, "flutterwave term granted");
  return { granted: true, already: false as const, periodEndsAt };
}

/**
 * Cancel a one-time Pro term (Flutterwave/crypto): there is nothing to
 * unsubscribe from, so this forfeits the remaining days immediately. Bachs
 * subscriptions must use /cancel instead.
 */
billingRouter.post("/term/cancel", async (req, res) => {
  const clerkId = req.auth!.userId;
  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { plan: true, trialStartedAt: true, bachsSubscriptionStatus: true, bachsTrialEnd: true, planExpiresAt: true },
  });
  if (!user || computeEffectivePlan(user) !== "ACTIVE") {
    throw new AppError(400, "There is no active Pro access to cancel.", "NO_ACTIVE_TERM");
  }
  if (user.bachsSubscriptionStatus === "active" || user.bachsSubscriptionStatus === "past_due" || user.bachsSubscriptionStatus === "trialing") {
    throw new AppError(400, "This account bills through a subscription — cancel that instead.", "USE_SUBSCRIPTION_CANCEL");
  }
  if (!user.planExpiresAt || user.planExpiresAt.getTime() <= Date.now()) {
    throw new AppError(400, "There is no active prepaid term to cancel.", "NO_TERM");
  }
  // Forfeiting a term must not also eat a still-running signup trial.
  const fallback = computeLocalPlan({ plan: "TRIAL", trialStartedAt: user.trialStartedAt });
  await prisma.user.update({ where: { clerkId }, data: { planExpiresAt: new Date(), plan: fallback === "TRIAL" ? Plan.TRIAL : Plan.EXPIRED } });
  logger.info({ clerkId }, "one-time Pro term forfeited");
  res.json({ data: { canceled: true } });
});

billingRouter.post("/flutterwave/verify", async (req, res) => {  const input = z.object({ transactionId: z.union([z.number(), z.string()]).optional(), txRef: z.string().min(1).optional() }).parse(req.body);
  if (input.transactionId === undefined && !input.txRef) {
    throw new AppError(400, "Provide transactionId or txRef.", "VALIDATION_ERROR");
  }
  const clerkId = req.auth!.userId;
  let verified: VerifiedFlutterwaveTransaction;
  if (input.transactionId !== undefined) {
    verified = await verifyFlutterwaveTransaction(input.transactionId);
  } else {
    const payment = await prisma.payment.findUnique({ where: { txRef: input.txRef! } });
    if (!payment || payment.ownerClerkId !== clerkId || !payment.providerTxId) {
      throw new AppError(404, "No verifiable payment found for this reference.", "PAYMENT_NOT_FOUND");
    }
    verified = await verifyFlutterwaveTransaction(payment.providerTxId);
  }
  res.json({ data: await fulfillFlutterwavePayment(clerkId, verified) });
});

billingWebhookRouter.post("/flutterwave/webhook", async (req, res) => {
  if (!flutterwaveWebhookValid(req.header("verif-hash") ?? undefined)) {
    res.status(401).json({ error: { code: "INVALID_SIGNATURE", message: "Invalid webhook signature." } });
    return;
  }
  const body = req.body as { event?: string; data?: { id?: number; tx_ref?: string; status?: string } };
  // Successful and failed payments share charge.completed — only successful
  // ones with a numeric id can grant anything.
  if (body?.event !== "charge.completed" || body?.data?.status !== "successful" || typeof body?.data?.id !== "number") {
    res.json({ data: { ignored: true } });
    return;
  }
  try {
    const verified = await verifyFlutterwaveTransaction(body.data.id);
    const payment = await prisma.payment.findUnique({ where: { txRef: verified.txRef }, select: { ownerClerkId: true } });
    if (!payment) {
      logger.warn({ txRef: verified.txRef }, "flutterwave webhook has no matching payment");
      res.json({ data: { ignored: true } });
      return;
    }
    const result = await fulfillFlutterwavePayment(payment.ownerClerkId, verified);
    res.json({ data: result });
  } catch (error) {
    // Business mismatches (unknown/failed/partial payment) must not retry;
    // transport and database failures should (non-2xx retries the webhook).
    if (error instanceof AppError && ["PAYMENT_NOT_SUCCESSFUL", "PAYMENT_NOT_FOUND", "PAYMENT_OWNER_MISMATCH", "PAYMENT_AMOUNT_MISMATCH"].includes(error.code)) {
      logger.warn({ error: error.message }, "flutterwave webhook ignored");
      res.json({ data: { ignored: true } });
      return;
    }
    logger.error({ error: error instanceof Error ? error.message : String(error) }, "flutterwave webhook failed");
    res.status(500).json({ error: { code: "WEBHOOK_FAILED", message: "Webhook processing failed." } });
  }
});

/**
 * Fulfill a paid Bachs crypto checkout as a 30/365-day Pro term — the same
 * shape as a Flutterwave term. Idempotent on txRef; strict on amount.
 */
async function grantBachsTerm(ownerClerkId: string, txRef: string, providerTxId: string, amount: number, currency: string) {
  const payment = await prisma.payment.findUnique({ where: { txRef } });
  if (!payment || payment.provider !== "bachs") throw new AppError(404, "No matching payment request.", "PAYMENT_NOT_FOUND");
  if (payment.ownerClerkId !== ownerClerkId) throw new AppError(403, "This payment belongs to a different account.", "PAYMENT_OWNER_MISMATCH");
  if (payment.status === "paid") return { granted: true, already: true as const, periodEndsAt: payment.periodEndsAt };
  const expected = payment.plan === "year" ? 50 : 5;
  if (currency !== "USD" || amount < expected) {
    throw new AppError(402, "Paid amount does not match the plan price.", "PAYMENT_AMOUNT_MISMATCH");
  }
  const days = payment.plan === "year" ? BACHS_USD_PRICES.year.days : BACHS_USD_PRICES.month.days;
  const paidAt = new Date();
  const periodEndsAt = new Date(paidAt.getTime() + days * 86_400_000);
  await prisma.payment.update({
    where: { txRef },
    data: { status: "paid", providerTxId, paidAt, periodEndsAt },
  });
  await prisma.user.update({ where: { clerkId: ownerClerkId }, data: { plan: Plan.ACTIVE, planExpiresAt: periodEndsAt } });
  logger.info({ clerkId: ownerClerkId, txRef, plan: payment.plan }, "bachs crypto term granted");
  return { granted: true, already: false as const, periodEndsAt };
}

/** Poll target for the overlay after a crypto checkout completes in-browser. */
billingRouter.post("/bachs/status", async (req, res) => {
  const checkoutId = z.object({ checkoutId: z.string().min(1) }).parse(req.body).checkoutId;
  const clerkId = req.auth!.userId;
  const session = await getCheckoutSession(checkoutId);
  const paymentStatus = session.payment_status ?? session.status ?? null;
  if (paymentStatus !== "succeeded") {
    res.json({ data: { paymentStatus, granted: false } });
    return;
  }
  const txRef = session.reference ?? undefined;
  const amount = Number(session.amount ?? NaN);
  const currency = (session.currency ?? "").toUpperCase();
  if (!txRef || !Number.isFinite(amount) || !currency) {
    throw new AppError(502, "Checkout session is missing payment details.", "PAYMENT_DETAILS_MISSING");
  }
  res.json({ data: { paymentStatus, ...(await grantBachsTerm(clerkId, txRef, session.checkout_id ?? checkoutId, amount, currency)) } });
});

type CollectionData = {
  reference?: unknown;
  client_reference?: unknown;
  checkout_id?: unknown;
  checkoutId?: unknown;
  amount?: unknown;
  total?: unknown;
  currency?: unknown;
  metadata?: Record<string, unknown>;
};

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/**
 * Fulfill a one-time crypto checkout from a webhook event. Parses leniently
 * (Bachs may add fields) and verifies through the session whenever the event
 * names one. Business mismatches return false (acknowledged, no retry);
 * transport failures throw (non-2xx retries the delivery).
 */
async function applyCryptoCollection(data: SubscriptionData & CollectionData, eventType: string): Promise<boolean> {
  const txRef = stringField(data.reference) ?? stringField(data.client_reference);
  if (!txRef) {
    logger.warn({ eventType }, "bachs crypto event has no reference");
    return false;
  }
  const payment = await prisma.payment.findUnique({ where: { txRef } });
  if (!payment || payment.provider !== "bachs") return false;
  if (payment.status === "paid") return true;
  const checkoutId = stringField(data.checkout_id) ?? stringField(data.checkoutId);
  try {
    if (checkoutId) {
      const session = await getCheckoutSession(checkoutId);
      if ((session.payment_status ?? session.status) !== "succeeded") return false;
      const amount = Number(session.amount ?? data.amount ?? data.total ?? NaN);
      const currency = String(session.currency ?? data.currency ?? "").toUpperCase();
      if (!Number.isFinite(amount) || !currency) return false;
      await grantBachsTerm(payment.ownerClerkId, txRef, session.checkout_id ?? checkoutId, amount, currency);
      return true;
    }
    const amount = Number(data.amount ?? data.total ?? NaN);
    const currency = String(data.currency ?? "").toUpperCase();
    if (!Number.isFinite(amount) || !currency) {
      logger.warn({ txRef, eventType }, "bachs collection event missing amount/currency");
      return false;
    }
    await grantBachsTerm(payment.ownerClerkId, txRef, txRef, amount, currency);
    return true;
  } catch (error) {
    if (error instanceof AppError) {
      logger.warn({ txRef, error: error.message }, "bachs crypto event rejected");
      return false;
    }
    throw error;
  }
}

/** A failed/underpaid/expired crypto checkout fails its pending payment row. */
async function failCryptoCollection(data: SubscriptionData & CollectionData, eventType: string): Promise<void> {
  const txRef = stringField(data.reference) ?? stringField(data.client_reference);
  if (!txRef) return;
  try {
    await prisma.payment.updateMany({ where: { txRef, status: "pending" }, data: { status: "failed" } });
  } catch (error) {
    logger.warn({ txRef, eventType, error: error instanceof Error ? error.message : String(error) }, "could not fail crypto payment");
  }
}
