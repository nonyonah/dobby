import { Router } from "express";
import { clerkClient } from "@clerk/express";
import { Plan } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { AppError } from "../middleware/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";
import { billingConfigured, cancelProSubscription, createPortalSession, createProCheckout, verifyBachsSignature, type BillingInterval } from "../lib/bachs.js";
import { computeEffectivePlan, computeLocalPlan, trialEndsAt } from "../middleware/plan.js";

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
      plan: computeLocalPlan(user) === "TRIAL" ? Plan.TRIAL : Plan.EXPIRED,
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
    },
  });

  res.json({
    data: {
      plan: user ? computeEffectivePlan(user) : "TRIAL",
      trialEndsAt: user ? trialEndsAt(user) : null,
      configured: billingConfigured(),
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
  const session = await createProCheckout({
    email,
    name,
    clerkUserId: clerkId,
    interval,
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
