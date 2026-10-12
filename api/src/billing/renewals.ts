/**
 * Renewing a saved card.
 *
 * A one-time checkout can offer bank transfer and crypto, which a recurring
 * product cannot — Bachs can only re-charge a card. That trade is what puts the
 * billing cycle here: the card is kept at checkout, and this job charges it each
 * period.
 *
 * The two kinds of customer are kept strictly apart:
 *
 *   - a **card** payer has a `pm_` id, is charged here every period, and keeps
 *     Pro without doing anything;
 *   - a **transfer or crypto** payer has nothing saved, so they are not in this
 *     job at all. Their access stops when the term ends and the renewal nudges
 *     tell them. There is no rail here that could re-charge them.
 *
 * Every charge carries an idempotency key keyed to the *period*, not the attempt.
 * A retry after a timeout that invented a new key would charge the customer twice
 * for one month.
 */

import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { chargeSavedCard, SUBSCRIPTION_PRICE_ANCHORS } from "../lib/bachs.js";

/** How far ahead of the due date a renewal is attempted, to absorb downtime. */
const RENEWAL_WINDOW_MS = 3 * 86_400_000;

/** Calendar months, so a renewal on the 31st does not drift into the next month. */
export function addMonths(from: Date, months: number): Date {
  const next = new Date(from.getTime());
  const day = next.getUTCDate();
  next.setUTCMonth(next.getUTCMonth() + months);
  if (next.getUTCDate() < day) next.setUTCDate(0);
  return next;
}

/** The period key an idempotency key is built from: one per customer per month. */
export function renewalKey(clerkId: string, chargeAt: Date): string {
  return `renew_${clerkId}_${chargeAt.toISOString().slice(0, 7)}`;
}

export type RenewalResult = {
  due: number;
  charged: number;
  failed: number;
  skipped: number;
};

type RenewalRow = {
  clerkId: string;
  bachsCustomerId: string | null;
  bachsPaymentMethodId: string | null;
  bachsChargeAmount: unknown;
  bachsChargeCurrency: string;
  bachsChargeInterval: string;
  bachsNextChargeAt: Date | null;
  planExpiresAt: Date | null;
  bachsSubscriptionId: string | null;
};

/**
 * Charges every saved card that is due.
 *
 * Runs off `bachsNextChargeAt` rather than recomputing from the last payment, so
 * a failed renewal is retried on its own schedule instead of silently skipping a
 * month.
 */
export async function renewSavedCards(now = new Date()): Promise<RenewalResult> {
  const result: RenewalResult = { due: 0, charged: 0, failed: 0, skipped: 0 };
  const horizon = new Date(now.getTime() + RENEWAL_WINDOW_MS);

  const rows = (await prisma.user.findMany({
    where: {
      bachsRecurring: true,
      bachsPaymentMethodId: { not: null },
      bachsNextChargeAt: { lte: horizon },
    },
    select: {
      clerkId: true,
      bachsCustomerId: true,
      bachsPaymentMethodId: true,
      bachsChargeAmount: true,
      bachsChargeCurrency: true,
      bachsChargeInterval: true,
      bachsNextChargeAt: true,
      planExpiresAt: true,
      bachsSubscriptionId: true,
    },
    take: 500,
  })) as RenewalRow[];

  for (const row of rows) {
    result.due += 1;

    // A live Bachs subscription is renewed by Bachs. Charging here as well is the
    // double charge this guard exists to prevent, so the loop stands down until
    // that subscription is gone.
    if (row.bachsSubscriptionId) {
      result.skipped += 1;
      continue;
    }
    if (!row.bachsCustomerId || !row.bachsPaymentMethodId || !row.bachsNextChargeAt) {
      result.skipped += 1;
      continue;
    }

    const interval = row.bachsChargeInterval === "year" ? "year" : "month";
    const months = interval === "year" ? 12 : 1;
    const amount = row.bachsChargeAmount
      ? Number(row.bachsChargeAmount)
      : Number(SUBSCRIPTION_PRICE_ANCHORS[interval]);
    const chargeAt = row.bachsNextChargeAt;

    try {
      const charge = await chargeSavedCard({
        customerId: row.bachsCustomerId,
        paymentMethodId: row.bachsPaymentMethodId,
        amount: amount.toFixed(2),
        currency: row.bachsChargeCurrency,
        idempotencyKey: renewalKey(row.clerkId, chargeAt),
        reference: `renewal_${row.clerkId}_${chargeAt.toISOString().slice(0, 10)}`,
        description: `Dobby Pro renewal — ${interval === "year" ? "yearly" : "monthly"}`,
      });

      // `processing` is not paid. Only a settled success extends access; the
      // webhook confirms it, but the card being accepted is what advances the
      // next charge date so a retry storm cannot re-bill the same period.
      if (charge.status === "failed") {
        result.failed += 1;
        logger.warn(
          { clerkId: row.clerkId, paymentId: charge.payment_id, amount, currency: charge.currency },
          "renewal card was declined; access is left to run out",
        );
        continue;
      }

      const endsAt = addMonths(chargeAt, months);
      await prisma.user.update({
        where: { clerkId: row.clerkId },
        data: { bachsNextChargeAt: addMonths(chargeAt, months), planExpiresAt: endsAt, planStatus: "pro" },
      });
      result.charged += 1;
      logger.info({ clerkId: row.clerkId, paymentId: charge.payment_id, status: charge.status, endsAt: endsAt.toISOString() }, "renewal submitted");
    } catch (error) {
      result.failed += 1;
      // Left due, so the next run tries again. Access is untouched meanwhile:
      // a Bachs outage must never be the thing that cancels a customer.
      logger.error({ clerkId: row.clerkId, err: error }, "renewal failed; will retry next run");
    }
  }

  logger.info(result, "saved-card renewal run complete");
  return result;
}