/**
 * Cash-out and yield detection.
 *
 * Everything here produces a *suggestion*. Nothing is confirmed automatically,
 * no transaction is rewritten behind the user's back, and no money moves: Dobby
 * is an advisor, not a filer.
 *
 * The confidence bands are deliberately lopsided. A missed suggestion costs the
 * user one tap they were going to take anyway; a wrong yield figure lands in a
 * tax estimate they then act on. So signals are accepted generously and
 * confirmed never.
 *
 * What is deliberately never detected: person-to-person transfers and generic
 * payment-processor credits. A P2P trade and an ordinary transfer between
 * friends are the same shape in a statement — money in, no matching outflow,
 * a human's name in the narration. Guessing at one produces a fabricated
 * cash-out. Those rows stay uncategorised in To Review, which is a question the
 * user can answer and a false answer they cannot detect.
 */

import { Prisma, TransactionType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { ngnPerUsd, rateAgrees } from "../lib/fx.js";
import { isNairaPeggedSymbol, isPlainStablecoin, isStablecoinSymbol, isUsdValued, isYieldBearingSymbol } from "../lib/stablecoins.js";
import { CONFIDENCE, stablecoinConfig } from "./config.js";
import { matchByAddress, matchByNarration, resolveEntities, type ResolvedEntity } from "./entities.js";
import { findReceiptPairing, providerEmailEvidence, receiptConfidence } from "./provider-email.js";

export type DetectionInput = {
  /** Bank/import rows to consider. Any source the ledger already holds. */
  since: Date;
};

export type DetectedEvent = {
  kind: "CASH_OUT" | "ON_RAMP" | "YIELD_RECEIVED" | "YIELD_REDEMPTION_GAIN";
  status: "SUGGESTED";
  token: string;
  chain: string | null;
  tokenAmount: number;
  usdValue: number | null;
  nairaAmount: number | null;
  impliedRate: number | null;
  feeAmount: number | null;
  stampDutyNote: boolean;
  onchainTxHash: string | null;
  linkedTransactionId: string | null;
  entityId: string | null;
  matchConfidence: number;
  reason: string;
};

const nairaOf = (transaction: { currency: string | null; amount: unknown }) =>
  (transaction.currency ?? "").toUpperCase() === "NGN" ? Number(transaction.amount) : null;

const usdOf = (transaction: { currency: string | null; amount: unknown }) => {
  const code = (transaction.currency ?? "").toUpperCase();
  const value = Number(transaction.amount);
  if (code !== "USD") return null;
  return Number.isFinite(value) ? value : null;
};

const narrationOf = (transaction: { description: string; merchant: string | null }) =>
  `${transaction.merchant ?? ""} ${transaction.description}`.trim();

/** Stablecoin outflows this user actually owns, from the persisted ledger. */
async function stablecoinOutflows(ownerClerkId: string, since: Date) {
  return prisma.transaction.findMany({
    where: {
      ownerClerkId,
      occurredAt: { gte: since },
      type: TransactionType.TRANSFER,
      transferDirection: "OUT",
      assetSymbol: { not: null },
    },
    select: { id: true, assetSymbol: true, amount: true, currency: true, occurredAt: true, metadata: true },
    take: 500,
  });
}

/** This user's own confirmed cash-outs, which know what their offramp paid. */
async function confirmedImpliedRates(ownerClerkId: string): Promise<number[]> {
  const rows = await prisma.stablecoinEvent.findMany({
    where: { ownerClerkId, kind: "CASH_OUT", status: "CONFIRMED", impliedRate: { not: null } },
    select: { impliedRate: true },
    take: 200,
  });
  return rows.map((row) => Number(row.impliedRate)).filter((rate) => Number.isFinite(rate) && rate > 0);
}

/**
 * S2 — pair a stablecoin outflow with a naira credit.
 *
 * Three things have to agree: the amounts imply a rate near a reference, the
 * timing falls inside the window, and the outflow goes somewhere plausible. A
 * known offramp address lifts confidence; without one the match is still made,
 * because the rate and window together are strong evidence on their own.
 */
async function detectPairedCashOuts(ownerClerkId: string, config: ReturnType<typeof stablecoinConfig>, offramps: ResolvedEntity[]): Promise<DetectedEvent[]> {
  const since = new Date(Date.now() - config.ONCHAIN_LOOKBACK_DAYS * 86_400_000);
  const [outflows, rates] = await Promise.all([
    stablecoinOutflows(ownerClerkId, since),
    confirmedImpliedRates(ownerClerkId),
  ]);
  const impliedPool = rates.length > 0 ? rates : [];
  const found: DetectedEvent[] = [];

  const credits = await prisma.transaction.findMany({
    where: { ownerClerkId, occurredAt: { gte: since }, type: { in: [TransactionType.INCOME, TransactionType.TRANSFER] }, currency: "NGN" },
    select: { id: true, amount: true, currency: true, description: true, merchant: true, occurredAt: true },
    take: 500,
  });

  for (const credit of credits) {
    const naira = nairaOf(credit);
    if (naira === null || naira <= 0) continue;
    // A narration we recognise is the strongest single hint, and is needed to
    // get past the P2P rule below.
    const narrationEntity = matchByNarration(offramps, narrationOf(credit));

    let best: { outflow: (typeof outflows)[number]; implied: number; usd: number | null; known: ResolvedEntity | null } | null = null;
    for (const outflow of outflows) {
      const token = (outflow.assetSymbol ?? "").toUpperCase();
      if (!isStablecoinSymbol(token)) continue;

      // A naira-pegged token has no USD leg to divide by, so the rate check
      // cannot run against a reference the same way. Its expected conversion is
      // roughly one to one — a cNGN token cashes out to something close to the
      // naira amount it represents, less whatever the provider charges — so that
      // is the reference it is judged against instead.
      const pegged = isNairaPeggedSymbol(token);
      const usd = pegged ? null : usdOf(outflow);
      const outflowLeg = pegged ? Number(outflow.amount) : usd;
      if (outflowLeg === null || !Number.isFinite(outflowLeg) || outflowLeg <= 0) continue;

      const hoursApart = Math.abs(outflow.occurredAt.getTime() - credit.occurredAt.getTime()) / 3_600_000;
      if (hoursApart > config.OFFRAMP_MATCH_WINDOW_HOURS) continue;

      const implied = naira / outflowLeg;
      const reference = pegged
        ? { rate: 1, date: credit.occurredAt.toISOString().slice(0, 10), source: "configured" as const }
        : await ngnPerUsd({ on: credit.occurredAt, impliedRates: impliedPool });
      // No reference means unverifiable. Falling back to "assume it matched"
      // here is how an unrelated naira credit becomes a fabricated cash-out.
      if (!rateAgrees(implied, reference, config.OFFRAMP_RATE_TOLERANCE)) continue;

      const counterparty = counterpartyAddress(outflow);
      const knownAddress = matchByAddress(offramps, counterparty);
      const score = knownAddress ? confidence(knownAddress, narrationEntity, config, true) : confidence(narrationEntity, null, config, false);
      if (best === null || score > bestScore(best)) best = { outflow, implied, usd, known: knownAddress };
    }

    if (!best) continue;
    // S3: a narration-only suggestion still counts, but only when we recognise
    // the sender. An unknown credit is never promoted on timing alone.
    if (!best.known && !narrationEntity) continue;

    const token = (best.outflow.assetSymbol ?? "STABLE").toUpperCase();
    const usd = best.usd;
    const named = best.known ?? narrationEntity;
    found.push({
      kind: "CASH_OUT",
      status: "SUGGESTED",
      token,
      chain: chainOf(best.outflow),
      tokenAmount: usd ?? 0,
      usdValue: usd,
      nairaAmount: naira,
      impliedRate: best.implied,
      feeAmount: feeFromNarration(narrationOf(credit)),
      // A note, never an amount: the duty falls on the transferee, so the user
      // cashing out may not bear it at all.
      stampDutyNote: true,
      onchainTxHash: hashOf(best.outflow),
      linkedTransactionId: best.outflow.id,
      entityId: named?.id ?? null,
      matchConfidence: confidence(named, null, config, true),
      reason: describeCashOut(token, usd, naira, best.implied, named),
    });
  }
  return found;
}

function confidence(named: ResolvedEntity | null, narrationEntity: ResolvedEntity | null, config: ReturnType<typeof stablecoinConfig>, paired: boolean): number {
  if (!paired) return narrationEntity ? CONFIDENCE.narration : CONFIDENCE.possibleYield;
  if (named?.address) return CONFIDENCE.pairedKnownAddress;
  return narrationEntity ? CONFIDENCE.providerEmail : CONFIDENCE.paired;
}

function bestScore(best: { known: ResolvedEntity | null }): number {
  return best.known?.address ? CONFIDENCE.pairedKnownAddress : CONFIDENCE.paired;
}

function counterpartyAddress(outflow: { metadata: unknown }): string | null {
  const metadata = outflow.metadata as { from?: unknown } | null;
  return typeof metadata?.from === "string" ? metadata.from : null;
}

function hashOf(outflow: { metadata: unknown }): string | null {
  const metadata = outflow.metadata as { hash?: unknown } | null;
  return typeof metadata?.hash === "string" ? metadata.hash : null;
}

function chainOf(outflow: { metadata: unknown }): string | null {
  const metadata = outflow.metadata as { chain?: unknown } | null;
  return typeof metadata?.chain === "string" ? metadata.chain : null;
}

/** Fee, when the provider's own narration states one. */
function feeFromNarration(narration: string): number | null {
  const match = /fee[:\s]+([\d,]+(?:\.\d+)?)/i.exec(narration);
  if (!match) return null;
  const value = Number.parseFloat(match[1]!.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function describeCashOut(token: string, usd: number | null, naira: number, implied: number, entity: ResolvedEntity | null): string {
  const usdText = usd === null ? `${token}` : `${usd.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${token}`;
  const via = entity ? ` via ${entity.name}` : "";
  return `${usdText} left your wallet and ₦${naira.toLocaleString("en-US", { maximumFractionDigits: 0 })} arrived${via} — about ₦${implied.toLocaleString("en-US", { maximumFractionDigits: 0 })} per $1.`;
}

/**
 * S1 — the offramp's own receipt, used to corroborate a pairing.
 *
 * Runs alongside the rate-based pairing rather than instead of it, and creates
 * the same event when it fires first; the unique constraint means whichever
 * detector gets there first wins and the other is recorded as a duplicate. The
 * email is what raises the confidence, because it is a first-party statement
 * about the user's own withdrawal.
 */
async function detectCashOutsFromProviderEmails(ownerClerkId: string, offramps: ResolvedEntity[]): Promise<DetectedEvent[]> {
  const evidence = await providerEmailEvidence(ownerClerkId);
  if (evidence.length === 0) return [];
  const found: DetectedEvent[] = [];

  for (const mail of evidence) {
    const pairing = await findReceiptPairing(ownerClerkId, mail);
    if (!pairing) continue;
    const knownAddress = matchByAddress(offramps, counterpartyAddress(pairing.outflow)) !== null;
    found.push({
      kind: "CASH_OUT",
      status: "SUGGESTED",
      token: pairing.token,
      chain: chainOf(pairing.outflow),
      tokenAmount: pairing.usd ?? Number(pairing.outflow.amount),
      usdValue: pairing.usd,
      nairaAmount: Number(pairing.credit.amount),
      impliedRate: pairing.impliedRate,
      feeAmount: null,
      stampDutyNote: true,
      onchainTxHash: hashOf(pairing.outflow),
      linkedTransactionId: pairing.outflow.id,
      entityId: mail.entity.id,
      matchConfidence: receiptConfidence(knownAddress),
      reason: `${pairing.token} left your wallet and ₦${Number(pairing.credit.amount).toLocaleString("en-US", { maximumFractionDigits: 0 })} arrived — confirmed by ${mail.entity.name}'s email${mail.subject ? ` (“${mail.subject}”)` : ""}.`,
    });
  }
  return found;
}

/**
 * On-ramp: naira spent, stablecoins received.
 *
 * The mirror of a cash-out and both legs are transfers for the same reason —
 * it is the user's own asset changing form. Needs a stablecoin inflow in the
 * window as well as a known onramp narration, so an ordinary naira payment
 * cannot become an on-ramp by sitting near a wallet transfer.
 */
async function detectOnRamps(ownerClerkId: string, config: ReturnType<typeof stablecoinConfig>, onramps: ResolvedEntity[]): Promise<DetectedEvent[]> {
  const since = new Date(Date.now() - config.ONCHAIN_LOOKBACK_DAYS * 86_400_000);
  const inflows = await prisma.transaction.findMany({
    where: { ownerClerkId, occurredAt: { gte: since }, transferDirection: "IN", assetSymbol: { not: null } },
    select: { id: true, assetSymbol: true, amount: true, currency: true, occurredAt: true, metadata: true },
    take: 500,
  });
  const stableInflows = inflows.filter((row) => isStablecoinSymbol(row.assetSymbol));
  if (stableInflows.length === 0) return [];

  const debits = await prisma.transaction.findMany({
    where: { ownerClerkId, occurredAt: { gte: since }, currency: "NGN", type: { in: [TransactionType.EXPENSE, TransactionType.TRANSFER] } },
    select: { id: true, amount: true, currency: true, description: true, merchant: true, occurredAt: true },
    take: 500,
  });

  const found: DetectedEvent[] = [];
  for (const debit of debits) {
    const entity = matchByNarration(onramps, narrationOf(debit));
    if (!entity) continue;
    const inflow = stableInflows.find((row) => {
      const hours = Math.abs(row.occurredAt.getTime() - debit.occurredAt.getTime()) / 3_600_000;
      return hours <= config.OFFRAMP_MATCH_WINDOW_HOURS;
    });
    if (!inflow) continue;
    const token = (inflow.assetSymbol ?? "STABLE").toUpperCase();
    const usd = usdOf(inflow);
    found.push({
      kind: "ON_RAMP",
      status: "SUGGESTED",
      token,
      chain: chainOf(inflow),
      tokenAmount: usd ?? Number(inflow.amount),
      usdValue: usd,
      nairaAmount: Number(debit.amount),
      impliedRate: usd && usd > 0 ? Number(debit.amount) / usd : null,
      feeAmount: feeFromNarration(narrationOf(debit)),
      stampDutyNote: true,
      onchainTxHash: hashOf(inflow),
      linkedTransactionId: inflow.id,
      entityId: entity.id,
      matchConfidence: entity.address ? CONFIDENCE.pairedKnownAddress : CONFIDENCE.paired,
      reason: `₦${Number(debit.amount).toLocaleString("en-US", { maximumFractionDigits: 0 })} went out and ${usd?.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${token} arrived, via ${entity.name}.`,
    });
  }
  return found;
}

/**
 * Y2 — depositing a yield-bearing token and later receiving the underlying back.
 *
 * The gain is what came back minus what went in, and that difference is the only
 * part that is income. A deposit on its own is the user's own asset moving, and
 * marking it as income would tax money that never left their control — which is
 * the specific mistake the brief called out.
 *
 * When the two legs cannot be paired the honest outcome is a suggestion for the
 * user to look at, not a guess. Receipts of an underlying with no matching
 * deposit in the window are far more often a purchase than a redemption, so
 * those are left entirely alone.
 */
async function detectRedemptionGains(ownerClerkId: string, config: ReturnType<typeof stablecoinConfig>): Promise<DetectedEvent[]> {
  const since = new Date(Date.now() - config.ONCHAIN_LOOKBACK_DAYS * 86_400_000);
  const legs = await prisma.transaction.findMany({
    where: { ownerClerkId, occurredAt: { gte: since }, assetSymbol: { not: null } },
    select: { id: true, assetSymbol: true, amount: true, currency: true, occurredAt: true, transferDirection: true, metadata: true },
    take: 500,
  });

  const found: DetectedEvent[] = [];
  // The real round trip is four legs, not two: deposit the underlying, receive
  // a position token, send that token back, and receive the underlying plus
  // whatever it earned. Only the first and last are in the same asset, so only
  // they can be subtracted from one another.
  const deposits = legs.filter((row) => row.transferDirection === "OUT" && isPlainStablecoin(row.assetSymbol));
  const redemptions = legs.filter((row) => row.transferDirection === "IN" && isPlainStablecoin(row.assetSymbol));

  for (const recovery of redemptions) {
    const token = normalizeToken(recovery.assetSymbol);
    // The most recent deposit of the same underlying before this recovery.
    const deposit = deposits
      .filter((row) => normalizeToken(row.assetSymbol) === token && row.occurredAt.getTime() < recovery.occurredAt.getTime())
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
    if (!deposit) continue;

    // A position token must have gone back out in between, or this is an
    // ordinary purchase of the underlying rather than a redemption of one.
    const positionLeft = legs.some(
      (row) =>
        row.transferDirection === "OUT" &&
        isYieldBearingSymbol(row.assetSymbol) &&
        row.occurredAt.getTime() > deposit.occurredAt.getTime() &&
        row.occurredAt.getTime() <= recovery.occurredAt.getTime(),
    );
    if (!positionLeft) continue;

    const deposited = Number(deposit.amount);
    const received = Number(recovery.amount);
    const gain = received - deposited;
    if (!Number.isFinite(gain) || gain <= 0) continue;

    found.push({
      kind: "YIELD_REDEMPTION_GAIN",
      status: "SUGGESTED",
      token,
      chain: chainOf(recovery),
      tokenAmount: gain,
      usdValue: isUsdValued(recovery.assetSymbol) ? gain : null,
      nairaAmount: null,
      impliedRate: null,
      feeAmount: null,
      stampDutyNote: false,
      onchainTxHash: hashOf(recovery),
      linkedTransactionId: recovery.id,
      entityId: null,
      matchConfidence: CONFIDENCE.paired,
      reason: `${gain.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${token} came back more than went in — the gain on redeeming, not the ${deposited.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${token} you deposited.`,
    });
  }
  return found;
}

function normalizeToken(symbol: string | null | undefined): string {
  return (symbol ?? "").trim().toUpperCase();
}

/**
 * Y1 — an inflow from a known yield protocol address is a yield receipt.
 *
 * Address-only, deliberately. A narration is not enough here: an address match
 * is what makes this more than a guess, and we do not have one seeded.
 */
async function detectYieldFromAddresses(ownerClerkId: string, protocols: ResolvedEntity[], config: ReturnType<typeof stablecoinConfig>): Promise<DetectedEvent[]> {
  const withAddresses = protocols.filter((entity) => entity.address);
  if (withAddresses.length === 0) return [];
  const since = new Date(Date.now() - config.ONCHAIN_LOOKBACK_DAYS * 86_400_000);

  const inflows = await prisma.transaction.findMany({
    where: { ownerClerkId, occurredAt: { gte: since }, transferDirection: "IN", assetSymbol: { not: null } },
    select: { id: true, assetSymbol: true, amount: true, currency: true, occurredAt: true, metadata: true },
    take: 500,
  });

  const found: DetectedEvent[] = [];
  for (const inflow of inflows) {
    const counterparty = counterpartyAddress(inflow);
    const entity = matchByAddress(withAddresses, counterparty);
    if (!entity) continue;
    const token = (inflow.assetSymbol ?? "STABLE").toUpperCase();
    const amount = usdOf(inflow) ?? Number(inflow.amount);
    found.push({
      kind: "YIELD_RECEIVED",
      status: "SUGGESTED",
      token,
      chain: chainOf(inflow),
      tokenAmount: amount,
      usdValue: isUsdValued(token) ? amount : null,
      nairaAmount: null,
      impliedRate: null,
      feeAmount: null,
      stampDutyNote: false,
      onchainTxHash: hashOf(inflow),
      linkedTransactionId: inflow.id,
      entityId: entity.id,
      matchConfidence: CONFIDENCE.providerEmail,
      reason: `${amount.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${token} arrived from ${entity.name}. Only the reward counts as income — not the amount you deposited.`,
    });
  }
  return found;
}

/**
 * Y3 — repeated small inflows from the same contract, on wallets the user said
 * earn yield. Off by default per wallet; a user opting in is the signal, and
 * without it these inflows are ordinary receipts and stay untouched.
 */
async function detectPossibleYield(ownerClerkId: string, config: ReturnType<typeof stablecoinConfig>): Promise<DetectedEvent[]> {
  const wallets = await prisma.walletAccount.findMany({ where: { ownerClerkId, isActive: true, earnsYield: true }, select: { id: true, chain: true } });
  if (wallets.length === 0) return [];
  const since = new Date(Date.now() - config.ONCHAIN_LOOKBACK_DAYS * 86_400_000);

  const inflows = await prisma.transaction.findMany({
    where: { ownerClerkId, occurredAt: { gte: since }, transferDirection: "IN", assetSymbol: { not: null } },
    select: { id: true, assetSymbol: true, amount: true, currency: true, occurredAt: true, metadata: true },
    take: 500,
  });

  const grouped = new Map<string, typeof inflows>();
  for (const inflow of inflows) {
    const from = counterpartyAddress(inflow) ?? "unknown";
    const key = `${from}|${(inflow.assetSymbol ?? "").toUpperCase()}`;
    grouped.set(key, [...(grouped.get(key) ?? []), inflow]);
  }

  const found: DetectedEvent[] = [];
  for (const [key, group] of grouped) {
    if (group.length < 2) continue;
    const [from, token] = key.split("|");
    const total = group.reduce((sum, row) => sum + (usdOf(row) ?? Number(row.amount)), 0);
    found.push({
      kind: "YIELD_RECEIVED",
      status: "SUGGESTED",
      token: token || "STABLE",
      chain: chainOf(group[0]!),
      tokenAmount: total,
      usdValue: isUsdValued(token ?? "") ? total : null,
      nairaAmount: null,
      impliedRate: null,
      feeAmount: null,
      stampDutyNote: false,
      onchainTxHash: null,
      // One event per group, anchored to the earliest row, so re-running cannot
      // multiply the suggestion.
      linkedTransactionId: group[group.length - 1]!.id,
      entityId: null,
      matchConfidence: CONFIDENCE.possibleYield,
      reason: `Possible yield: ${group.length} transfers from ${from === "unknown" ? "the same source" : from}, totalling ${total.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${token}.`,
    });
  }
  return found;
}

/**
 * Runs every detector and writes the results.
 *
 * Idempotent through the unique constraints rather than a read-before-write
 * check, because every trigger runs on every sync and a race between two of
 * them is more likely than a careful check survives.
 */
export async function detectStablecoinEvents(ownerClerkId: string): Promise<{ created: number; duplicates: number }> {
  const config = stablecoinConfig();
  const entities = await resolveEntities(ownerClerkId);

  const candidates = [
    ...(await detectPairedCashOuts(ownerClerkId, config, entities.offramps)),
    ...(await detectCashOutsFromProviderEmails(ownerClerkId, entities.offramps)),
    ...(await detectOnRamps(ownerClerkId, config, entities.onramps)),
    ...(await detectRedemptionGains(ownerClerkId, config)),
    ...(await detectYieldFromAddresses(ownerClerkId, entities.yieldProtocols, config)),
    ...(await detectPossibleYield(ownerClerkId, config)),
  ];

  let created = 0;
  let duplicates = 0;
  for (const candidate of candidates) {
    try {
      await prisma.stablecoinEvent.create({ data: { ownerClerkId, ...toRow(candidate) } });
      created += 1;
    } catch (error) {
      // P2002 is the unique constraint doing exactly its job: this movement was
      // already suggested by an earlier run or another trigger.
      if (isUniqueViolation(error)) duplicates += 1;
      else logger.error({ ownerClerkId, error: error instanceof Error ? error.message : String(error) }, "stablecoin event write failed");
    }
  }

  logger.info({ ownerClerkId, created, duplicates, considered: candidates.length }, "stablecoin detection complete");
  return { created, duplicates };
}

function toRow(event: DetectedEvent) {
  return {
    kind: event.kind,
    status: event.status,
    token: event.token,
    chain: (event.chain === "BASE" || event.chain === "SOLANA" ? event.chain : null) as "BASE" | "SOLANA" | null,
    tokenAmount: new Prisma.Decimal(event.tokenAmount),
    usdValue: event.usdValue === null ? null : new Prisma.Decimal(event.usdValue),
    nairaAmount: event.nairaAmount === null ? null : new Prisma.Decimal(event.nairaAmount),
    impliedRate: event.impliedRate === null ? null : new Prisma.Decimal(event.impliedRate),
    feeAmount: event.feeAmount === null ? null : new Prisma.Decimal(event.feeAmount),
    stampDutyNote: event.stampDutyNote,
    onchainTxHash: event.onchainTxHash,
    linkedTransactionId: event.linkedTransactionId,
    entityId: event.entityId,
    matchConfidence: new Prisma.Decimal(Math.round(event.matchConfidence * 100) / 100),
    reason: event.reason,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}