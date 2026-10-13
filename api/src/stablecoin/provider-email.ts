/**
 * S1: the provider's own receipt.
 *
 * An offramp sends an email when a withdrawal completes, naming the provider,
 * the amount received and the time. That is a first-party statement about the
 * user's own transaction, and it is the strongest evidence available — which is
 * why it is the one signal that can carry a suggestion the rate check alone
 * could not support.
 *
 * It is used as corroboration rather than as a detection on its own. An email
 * says "we sent you naira"; it does not say which wallet the tokens left, and
 * inventing that link would attach a receipt to the wrong movement. So the email
 * raises confidence and confirms the pairing is real, while the on-chain
 * outflow and the naira credit still have to be found.
 *
 * The fallback that matters: a user's own offramp may not be one we have
 * seeded, and may not put its name in the narration. Once they have confirmed
 * one event and chosen to remember the sender, that entity matches here too —
 * which is why this reads UserEntity as well as KnownEntity.
 */

import { TransactionType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { stablecoinConfig } from "./config.js";
import { narrationMatches, resolveEntities, type ResolvedEntity } from "./entities.js";
import { CONFIDENCE } from "./config.js";
import { isStablecoinSymbol, isUsdValued } from "../lib/stablecoins.js";

export type ProviderEmailEvidence = { entity: ResolvedEntity; receivedAt: Date; subject: string | null };

/** Wording that marks a mail as a completed withdrawal rather than a promo. */
/**
 * Completion wording, permissive about the exact phrasing.
 *
 * Real providers all say it slightly differently — "your withdrawal is
 * complete", "withdrawal successful", "your funds have been sent". Matching a
 * narrower set silently drops the strongest evidence available on the ones that
 * phrased it differently, so the optional filler word is allowed rather than
 * required.
 */
const COMPLETION_TERMS =
  /(withdrawal\s+(?:is\s+|has\s+been\s+)?complete|withdrawal\s+successful(?:ly)?|payout\s+(?:is\s+)?sent|funds\s+(?:have\s+been\s+|were\s+)?sent|you\s+have\s+received|transaction\s+complete)/i;

/**
 * Provider emails in the lookback window.
 *
 * Receipts and alerts both qualify: an offramp that sends the receipt as a
 * bank-style notification classifies as an alert, and one that attaches a PDF
 * classifies as a receipt. Promotional mail is excluded by the completion
 * wording — "withdrawal complete" is evidence, "withdraw now" is advertising.
 */
export async function providerEmailEvidence(ownerClerkId: string): Promise<ProviderEmailEvidence[]> {
  const since = new Date(Date.now() - stablecoinConfig().ONCHAIN_LOOKBACK_DAYS * 86_400_000);
  const { offramps } = await resolveEntities(ownerClerkId);
  if (offramps.length === 0) return [];

  const mails = await prisma.emailImport.findMany({
    where: { ownerClerkId, createdAt: { gte: since }, kind: { in: ["receipt", "alert"] } },
    select: { subject: true, fromAddress: true, receivedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const found: ProviderEmailEvidence[] = [];
  for (const mail of mails) {
    const haystack = `${mail.fromAddress ?? ""} ${mail.subject ?? ""}`;
    const entity = offramps.find((candidate) => narrationMatches(candidate, haystack));
    if (!entity) continue;
    if (!COMPLETION_TERMS.test(haystack)) continue;
    found.push({ entity, receivedAt: mail.receivedAt ?? mail.createdAt, subject: mail.subject });
  }
  return found;
}

/**
 * A provider receipt that lands near a stablecoin outflow and a naira credit.
 *
 * Returns the pairing it can support, or null. Deliberately tolerant about the
 * rate: the provider has already told us the withdrawal happened, so requiring
 * the implied rate to match would discard the best evidence we have in favour of
 * a cross-check it cannot fail. It still requires both legs to exist.
 */
export async function findReceiptPairing(ownerClerkId: string, evidence: ProviderEmailEvidence) {
  const config = stablecoinConfig();
  const windowMs = config.OFFRAMP_MATCH_WINDOW_HOURS * 3_600_000;

  const outflows = await prisma.transaction.findMany({
    where: {
      ownerClerkId,
      type: TransactionType.TRANSFER,
      transferDirection: "OUT",
      assetSymbol: { not: null },
      occurredAt: { gte: new Date(evidence.receivedAt.getTime() - windowMs), lte: new Date(evidence.receivedAt.getTime() + windowMs) },
    },
    select: { id: true, assetSymbol: true, amount: true, currency: true, occurredAt: true, metadata: true },
    take: 100,
  });

  const stable = outflows.filter((outflow) => isStablecoinSymbol(outflow.assetSymbol));
  if (stable.length === 0) return null;

  const credits = await prisma.transaction.findMany({
    where: {
      ownerClerkId,
      type: { in: [TransactionType.INCOME, TransactionType.TRANSFER] },
      currency: "NGN",
      occurredAt: { gte: new Date(evidence.receivedAt.getTime() - windowMs), lte: new Date(evidence.receivedAt.getTime() + windowMs) },
    },
    select: { id: true, amount: true, occurredAt: true },
    take: 100,
  });
  const credit = credits.find((row) => Number(row.amount) > 0);
  if (!credit) return null;

  const outflow = stable[0]!;
  const token = (outflow.assetSymbol ?? "STABLE").toUpperCase();
  const usd = outflow.currency?.toUpperCase() === "USD" ? Number(outflow.amount) : null;
  const pegged = !isUsdValued(token);
  const leg = pegged ? Number(outflow.amount) : usd;

  return {
    outflow,
    credit,
    token,
    usd,
    impliedRate: leg && leg > 0 ? Number(credit.amount) / leg : null,
  };
}

/** Confidence for a pairing corroborated by the provider's own email. */
export function receiptConfidence(hasKnownAddress: boolean): number {
  return hasKnownAddress ? CONFIDENCE.providerEmail : CONFIDENCE.pairedKnownAddress;
}