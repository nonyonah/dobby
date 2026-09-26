import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

export type BankHit = { bank: string; verified: boolean };
export type MerchantHit = { merchant: string; category?: string };

/**
 * In-memory sender directory, loaded once per sync run (10-minute TTL).
 * Exact addresses win over domain suffixes; verified rules win over hints.
 * An empty/seedless table degrades to "no hits" — never to an error.
 */
export type SenderDirectory = {
  loadedAt: number;
  exact: Map<string, BankHit>;
  domains: Array<{ domain: string; bank: string; verified: boolean }>;
  merchantExact: Map<string, MerchantHit>;
  merchantDomains: Array<{ domain: string; merchant: string; category?: string }>;
  merchantSubjects: Array<{ pattern: string; merchant: string; category?: string }>;
};

const EMPTY: SenderDirectory = {
  loadedAt: 0,
  exact: new Map(),
  domains: [],
  merchantExact: new Map(),
  merchantDomains: [],
  merchantSubjects: [],
};

let cache: SenderDirectory | null = null;
const TTL_MS = 10 * 60_000;

export async function loadSenderDirectory(force = false): Promise<SenderDirectory> {
  if (cache && !force && Date.now() - cache.loadedAt < TTL_MS) return cache;
  try {
    const [senders, merchants] = await Promise.all([
      prisma.bankSenderRule.findMany({ select: { matchType: true, pattern: true, verified: true, bank: { select: { name: true } } } }),
      prisma.merchantRule.findMany({ select: { merchant: true, category: true, matchType: true, pattern: true } }),
    ]);
    const directory: SenderDirectory = {
      loadedAt: Date.now(),
      exact: new Map(),
      domains: [],
      merchantExact: new Map(),
      merchantDomains: [],
      merchantSubjects: [],
    };
    for (const rule of senders) {
      if (rule.matchType === "exact") directory.exact.set(rule.pattern.toLowerCase(), { bank: rule.bank.name, verified: rule.verified });
      else if (rule.matchType === "domain") {
        directory.domains.push({ domain: rule.pattern.toLowerCase(), bank: rule.bank.name, verified: rule.verified });
      }
    }
    // Longest domain first so mail.bank.com beats bank.com; verified first.
    directory.domains.sort(
      (a, b) => b.domain.length - a.domain.length || Number(b.verified) - Number(a.verified),
    );
    for (const rule of merchants) {
      const pattern = rule.pattern.toLowerCase();
      const hit = { merchant: rule.merchant, category: rule.category ?? undefined };
      if (rule.matchType === "exact") directory.merchantExact.set(pattern, hit);
      else if (rule.matchType === "domain") directory.merchantDomains.push({ domain: pattern, ...hit });
      else if (rule.matchType === "subject") directory.merchantSubjects.push({ pattern, ...hit });
    }
    directory.merchantDomains.sort((a, b) => b.domain.length - a.domain.length);
    cache = directory;
    return directory;
  } catch (error) {
    logger.warn({ error: error instanceof Error ? error.message : String(error) }, "sender directory unavailable, matching without it");
    return EMPTY;
  }
}

/** "OPay <no-reply@opay-nigeria.com>" → "no-reply@opay-nigeria.com". */
export function addressOf(from: string | null | undefined): string | null {
  if (!from) return null;
  const angled = /<([^<>\s]+@[^<>\s]+)>/.exec(from);
  const raw = (angled?.[1] ?? from).trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw) ? raw : null;
}

function domainMatches(domain: string, rule: string): boolean {
  return domain === rule || domain.endsWith(`.${rule}`);
}

export function matchBankSender(from: string | null | undefined, directory: SenderDirectory): BankHit | undefined {
  const address = addressOf(from);
  if (!address) return undefined;
  const direct = directory.exact.get(address);
  if (direct) return direct;
  const domain = address.split("@")[1] ?? "";
  return directory.domains.find((rule) => domainMatches(domain, rule.domain));
}

export function matchMerchant(
  from: string | null | undefined,
  subject: string | null | undefined,
  directory: SenderDirectory,
): MerchantHit | undefined {
  const address = addressOf(from);
  if (address) {
    const direct = directory.merchantExact.get(address);
    if (direct) return direct;
    const domain = address.split("@")[1] ?? "";
    const byDomain = directory.merchantDomains.find((rule) => domainMatches(domain, rule.domain));
    if (byDomain) return byDomain;
  }
  const subjectText = (subject ?? "").toLowerCase();
  if (subjectText) {
    return directory.merchantSubjects.find((rule) => subjectText.includes(rule.pattern));
  }
  return undefined;
}

/** Bank and/or merchant attribution for a message, for review metadata. */
export function describeSender(
  from: string | null | undefined,
  subject: string | null | undefined,
  directory: SenderDirectory,
): { bank?: string; bankVerified?: boolean; merchant?: string; merchantCategory?: string } {
  const bank = matchBankSender(from, directory);
  const merchant = matchMerchant(from, subject, directory);
  return {
    ...(bank ? { bank: bank.bank, bankVerified: bank.verified } : {}),
    ...(merchant ? { merchant: merchant.merchant, merchantCategory: merchant.category } : {}),
  };
}
