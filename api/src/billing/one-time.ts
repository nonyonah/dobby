/**
 * Fulfilling a one-time purchase (bank transfer or crypto).
 *
 * Everything here is written on one rule: the webhook tells us *something
 * happened*, never *what was bought*. A bank transfer takes minutes and a crypto
 * payment can be underpaid, so the event body is a trigger to go and check —
 * the checkout is re-read from Bachs and the amount is compared against the plan
 * before any access exists. The customer returning from the redirect proves
 * nothing at all; they can close the tab and open the URL themselves.
 *
 * `collection.succeeded` and `checkout.completed` both fire for one payment and
 * either may arrive first, so fulfilment is written to be safe to run twice and
 * the webhook receiver additionally drops a repeated `event.id`.
 */

import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { notifyUnderpaid, notifyOneTimePayment } from "../lib/mailer.js";
import { ONE_TIME_MONTHS, retrieveCheckout, SUBSCRIPTION_PRICE_ANCHORS } from "../lib/bachs.js";

/** The provider value written on every row this module creates. */
export const ONE_TIME_PROVIDER = "bachs";

/**
 * The shape every one-time event carries, across `collection.*`, `checkout.*`
 * and `refund.paid`.
 */
export type OneTimeEventData = {
  checkout_id?: string | null;
  charge_id?: string | null;
  reference?: string | null;
  status?: string;
  amount?: string;
  currency?: string;
  /** `collection.underpaid` only. */
  amount_paid?: string;
  amount_expected?: string;
  amount_remaining?: string;
  /** `refund.paid`. */
  charge?: { id?: string | null } | null;
  payment?: { id?: string | null; charge_id?: string | null } | null;
  /** `payment_method.saved`: the card that is now kept for later. */
  payment_method_details?: {
    id?: string | null;
    type?: string | null;
    card_last4?: string | null;
    currency?: string | null;
  } | null;
  customer?: { id?: string | null; email?: string | null };
  customer_details?: { email?: string };
  metadata?: Record<string, unknown>;
};

/** The price this module expects a completed checkout to have been made for. */
const expectedAmount = () => Number(SUBSCRIPTION_PRICE_ANCHORS.month);

/**
 * A unique reference per attempt.
 *
 * Unique rather than stable-on-purpose: a customer whose checkout expired can
 * simply start again, and a new reference keeps that second attempt a distinct
 * order instead of quietly landing on top of the first one.
 */
export function newOneTimeReference(clerkId: string): string {
  return `dobby_once_${clerkId.slice(0, 12)}_${crypto.randomBytes(6).toString("hex")}`;
}

/**
 * Adds whole calendar months.
 *
 * Calendar rather than 30-day multiples so "one month" ends on the same day of
 * the next month — with 30 days, a purchase on the 31st lands on the 1st of the
 * month after, and the renewal reminders then fire against a date nobody was
 * ever told about.
 */
export function addMonths(from: Date, months: number): Date {
  const next = new Date(from.getTime());
  const day = next.getUTCDate();
  next.setUTCMonth(next.getUTCMonth() + months);
  // setUTCMonth overflows (31 Jan + 1 month -> 3 Mar), so pull back to the last
  // valid day of the target month instead.
  if (next.getUTCDate() < day) next.setUTCDate(0);
  return next;
}

/**
 * Finds the pending order this event belongs to.
 *
 * Matched on the reference we generated, never on the amount or the email: the
 * reference is the only part of the payload we chose and therefore the only part
 * an attacker would have to guess.
 */
async function findOrder(data: OneTimeEventData) {
  if (data.reference) {
    const byRef = await prisma.payment.findUnique({ where: { txRef: data.reference } });
    if (byRef) return byRef;
  }
  if (data.checkout_id) {
    // The checkout id is one we were given when we created the session, so this
    // is a lookup of our own rows and not a match against customer-supplied
    // data. Needed because `reference` is absent on some deliveries.
    return prisma.payment.findFirst({ where: { provider: ONE_TIME_PROVIDER, checkoutId: data.checkout_id } });
  }
  return null;
}

/**
 * Grants the purchased months.
 *
 * Starts from the later of now and the current end date, so renewing early
 * extends the existing term rather than replacing it — and buying again after a
 * lapse starts from today, not from a date in the past.
 */
async function grantMonths(clerkId: string, currentEnd: Date | null, months: number, now: Date): Promise<Date> {
  const base = currentEnd && currentEnd.getTime() > now.getTime() ? currentEnd : now;
  const endsAt = addMonths(base, months);
  await prisma.user.update({ where: { clerkId }, data: { planExpiresAt: endsAt, planStatus: "pro" } });
  return endsAt;
}

/**
 * Confirms against Bachs that this checkout is genuinely paid, for the plan we
 * think it is.
 *
 * Returns null when it is safe to grant, or a string explaining why not. The
 * amount check is deliberately on the *session*, not the event: with adaptive
 * pricing the customer may pay in their own currency, so comparing the event's
 * NGN figure to a USD price would fail every legitimate payment outside the US.
 */
async function verifyAgainstBachs(checkoutId: string, order: { txRef: string }): Promise<string | null> {
  let live;
  try {
    live = await retrieveCheckout(checkoutId);
  } catch (error) {
    // Unreachable Bachs is not evidence of anything. Refusing to grant here would
    // take access away from a customer who has already paid.
    logger.error(
      { checkoutId, err: error instanceof Error ? error.message : String(error) },
      "could not re-read checkout from bachs; not granting on an unverified webhook",
    );
    return "checkout could not be verified";
  }

  if (live.payment_status !== "succeeded") {
    return `checkout payment_status is "${live.payment_status ?? "unknown"}", not "succeeded"`;
  }

  // The reference is echoed back; if it does not match, this event is about a
  // different order than the one we are about to credit.
  if (live.reference && live.reference !== order.txRef) {
    return `checkout reference "${live.reference}" does not match order "${order.txRef}"`;
  }

  if (live.amount) {
    const paid = Number(live.amount);
    const expected = expectedAmount();
    // A currency that is not ours means adaptive pricing converted it, which is
    // the expected path for naira and crypto, not a mismatch.
    const sameCurrency = !live.currency || live.currency === "USD";
    if (sameCurrency && Math.abs(paid - expected) > 0.005) {
      return `checkout amount ${live.amount} does not match the plan price ${expected.toFixed(2)}`;
    }
    if (!sameCurrency) {
      logger.info(
        { checkoutId, amount: live.amount, currency: live.currency, expectedUsd: expected },
        "one-time checkout paid in a converted currency; accepting the converted figure",
      );
    }
  }

  return null;
}

/**
 * Fulfils a paid one-time purchase.
 *
 * Safe to call for both `collection.succeeded` and `checkout.completed`, and
 * safe to call twice for either.
 */
export async function fulfilOneTimePayment(data: OneTimeEventData, eventType: string): Promise<void> {
  const order = await findOrder(data);
  if (!order) {
    logger.warn({ eventType, reference: data.reference, checkoutId: data.checkout_id }, "one-time payment event has no matching order");
    return;
  }
  if (order.provider !== ONE_TIME_PROVIDER) {
    logger.warn({ eventType, provider: order.provider }, "ignoring a Bachs one-time event for a non-Bachs order");
    return;
  }
  // Already fulfilled. This is the path a duplicate delivery takes, and the
  // reason fulfilment is written to be re-runnable.
  if (order.status === "paid") {
    logger.info({ eventType, txRef: order.txRef }, "one-time payment already fulfilled; ignoring repeat");
    return;
  }

  const checkoutId = data.checkout_id ?? null;
  if (!checkoutId) {
    logger.warn({ eventType, txRef: order.txRef }, "one-time payment event carried no checkout_id; cannot verify");
    return;
  }

  const problem = await verifyAgainstBachs(checkoutId, order);
  if (problem) {
    // Deliberately not granted and not auto-refunded: a mismatch is something a
    // human should look at, and silently refunding a customer who paid is worse.
    logger.error({ eventType, checkoutId, txRef: order.txRef, problem }, "refusing to grant access for an unverified one-time payment");
    return;
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: order.ownerClerkId },
    select: { planExpiresAt: true, email: true, firstName: true },
  });
  if (!user) {
    logger.warn({ txRef: order.txRef }, "one-time order has no owning user");
    return;
  }

  const now = new Date();
  const endsAt = await grantMonths(order.ownerClerkId, user.planExpiresAt, order.months || ONE_TIME_MONTHS, now);

  // The unique index on (provider, providerTxId) is the last line of defence: a
  // race that grants twice cannot write a second paid row, and this update is
  // rejected instead of overwriting.
  const chargeId = data.charge_id ?? null;
  try {
    await prisma.payment.update({
      where: { id: order.id },
      data: {
        status: "paid",
        paidAt: now,
        periodEndsAt: endsAt,
        ...(chargeId ? { providerTxId: chargeId } : {}),
      },
    });
  } catch (error) {
    logger.error({ txRef: order.txRef, chargeId, err: error }, "could not mark the one-time order paid");
    return;
  }

  logger.info({ txRef: order.txRef, chargeId, endsAt: endsAt.toISOString(), months: order.months }, "one-time payment fulfilled");
  await notifyOneTimePayment(order.ownerClerkId, endsAt).catch((error: unknown) => {
    logger.warn({ txRef: order.txRef, err: error }, "one-time payment confirmed but the receipt email failed");
  });
}

/**
 * A crypto payment that arrived short.
 *
 * Grants nothing and refunds nothing. Bachs lets the customer send the remainder
 * to the same reference, so the order can still complete on its own; taking the
 * money and ending the sale would be the wrong answer to a transfer that is
 * usually just slow or mis-keyed.
 *
 * Note this fires for crypto only — a bank transfer that lands short does not
 * complete and sends no event, so there is nothing to match here.
 */
export async function handleUnderpaid(data: OneTimeEventData, eventType: string): Promise<void> {
  const order = await findOrder(data);
  if (!order) {
    logger.warn({ eventType, reference: data.reference }, "underpaid event has no matching order");
    return;
  }

  const currency = data.currency ?? order.currency;
  const remaining = data.amount_remaining ?? null;

  await prisma.payment.updateMany({
    where: { id: order.id, status: { not: "paid" } },
    data: {
      status: "underpaid",
      shortfall: remaining ? new Prisma.Decimal(remaining) : undefined,
    },
  });

  logger.warn(
    { txRef: order.txRef, paid: data.amount_paid, expected: data.amount_expected, remaining, currency },
    "crypto payment arrived short; no access granted and no automatic refund",
  );

  await notifyUnderpaid(order.ownerClerkId, {
    amountPaid: data.amount_paid ?? null,
    amountExpected: data.amount_expected ?? null,
    amountRemaining: remaining,
    currency,
  }).catch((error: unknown) => {
    logger.warn({ txRef: order.txRef, err: error }, "underpaid email failed to send");
  });
}

/**
 * A refund on a one-time purchase.
 *
 * Shortens the access that payment bought rather than clearing the column: the
 * term may have been renewed on top of it, and zeroing `planExpiresAt` would
 * revoke months the customer paid for and that nobody refunded.
 *
 * The end date moves back by exactly the months this payment was for, which
 * leaves any later purchase untouched.
 */
export async function handleRefund(data: OneTimeEventData, eventType: string): Promise<void> {
  const chargeId = data.charge?.id ?? data.payment?.charge_id ?? data.charge_id ?? null;
  let order = null;
  if (chargeId) {
    order = await prisma.payment.findFirst({ where: { provider: ONE_TIME_PROVIDER, providerTxId: chargeId } });
  }
  if (!order) order = await findOrder(data);
  if (!order) {
    logger.warn({ eventType, chargeId }, "refund has no matching one-time order");
    return;
  }

  await prisma.payment.update({ where: { id: order.id }, data: { status: "refunded" } });

  const user = await prisma.user.findUnique({ where: { clerkId: order.ownerClerkId }, select: { planExpiresAt: true } });
  if (!user?.planExpiresAt) {
    logger.info({ txRef: order.txRef }, "refund recorded; no access window to shorten");
    return;
  }

  // Undo from the end, never from today: the refund removes what this purchase
  // added, so a term that was already partly used loses the months after now.
  const months = order.months || ONE_TIME_MONTHS;
  const shortened = addMonths(user.planExpiresAt, -months);
  const floor = new Date();

  await prisma.user.update({
    where: { clerkId: order.ownerClerkId },
    data: { planExpiresAt: shortened.getTime() > floor.getTime() ? shortened : floor },
  });

  logger.info({ txRef: order.txRef, was: user.planExpiresAt.toISOString(), now: shortened.toISOString() }, "refund shortened one-time access");
}