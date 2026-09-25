import { TransactionType } from "@prisma/client";
import { prisma } from "./prisma.js";
import { convertCurrencyAmount } from "../providers/frankfurter.js";

export type ProactiveFlagKind = "unusual_spend" | "missed_deduction";

export interface ProactiveFlag {
  id: string;
  kind: ProactiveFlagKind;
  title: string;
  detail: string;
  href: string;
  amount?: number;
}

export interface ProactiveFlagResult {
  flags: ProactiveFlag[];
  currency: string;
  /** Label for the month the unusual-spend comparison covers, e.g. "March 2026". */
  periodLabel: string | null;
  asOf: string;
}

/** A month must run this far above its trailing average to be flagged. */
const UNUSUAL_SPEND_RATIO = 1.6;
/** …and by at least this much, so tiny categories never raise noise. */
const UNUSUAL_SPEND_MIN_DELTA = 50;
/** Trailing window used as "your usual pace". */
const TRAILING_MONTHS = 3;
/** A merchant must repeat this often before it counts as recurring. */
const MIN_RECURRING_CHARGES = 3;
/** Missed-deduction candidates only look back this far. */
const RECURRING_WINDOW_MONTHS = 12;
const MAX_FLAGS = 8;

/**
 * Words that mark a recurring charge as plausibly business-related. Used only
 * to narrow candidates — the flag still tells the user it is their call whether
 * the charge qualifies as a deduction.
 */
const DEDUCTION_KEYWORDS = [
  "software", "subscription", "saas", "cloud", "hosting", "server", "domain",
  "aws", "azure", "gcp", "github", "figma", "adobe", "notion", "slack", "zoom",
  "dropbox", "openai", "tools", "office", "stationery", "training", "course",
  "certification", "shipping", "courier", "marketing", "advertising", "freelance",
  "contractor", "legal", "accounting", "professional fee", "bank fee", "repair",
  "equipment", "hardware", "laptop", "monitor",
];

const monthStart = (date: Date, monthOffset: number) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, 1));

const money = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
};

const monthLabel = (date: Date) =>
  date.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

async function conversionFactors(currencies: string[], target: string) {
  const factors = new Map<string, number>();
  for (const currency of new Set(currencies.map((value) => value.toUpperCase()))) {
    if (currency === target) {
      factors.set(currency, 1);
      continue;
    }
    try {
      factors.set(currency, await convertCurrencyAmount(1, currency, target));
    } catch {
      factors.set(currency, 1);
    }
  }
  return factors;
}

/**
 * Detects unusual category spending and missed deduction candidates straight
 * from the stored ledger. Every number is computed from transactions, never
 * generated, so the text always matches the account.
 *
 * The spend comparison runs against the most recent month with expense
 * activity rather than the calendar month, so accounts with older imports
 * still get meaningful flags instead of an empty result.
 */
export async function computeProactiveFlags(ownerClerkId: string): Promise<ProactiveFlagResult> {
  const profile = await prisma.profile.findUnique({ where: { clerkId: ownerClerkId }, select: { currency: true } });
  const currency = profile?.currency?.toUpperCase() ?? "USD";
  const now = new Date();

  const rows = await prisma.transaction.findMany({
    where: { ownerClerkId, occurredAt: { gte: monthStart(now, -(TRAILING_MONTHS + RECURRING_WINDOW_MONTHS)), lt: now } },
    select: {
      id: true,
      type: true,
      amount: true,
      currency: true,
      occurredAt: true,
      merchant: true,
      description: true,
      isTaxable: true,
      category: { select: { id: true, name: true } },
    },
    orderBy: { occurredAt: "desc" },
    take: 20_000,
  });

  const latestExpense = rows.find((row) => row.type === TransactionType.EXPENSE);
  const factors = await conversionFactors(rows.map((row) => row.currency ?? "USD"), currency);
  const convert = (value: number, source: string) => value * (factors.get((source ?? "USD").toUpperCase()) ?? 1);

  const flags: ProactiveFlag[] = [];
  let period: string | null = null;

  // 1. Unusual spend: latest active month vs the average of the 3 before it.
  if (latestExpense) {
    const analysisStart = monthStart(latestExpense.occurredAt, 0);
    const analysisEnd = monthStart(latestExpense.occurredAt, 1);
    const trailingStart = monthStart(latestExpense.occurredAt, -TRAILING_MONTHS);
    period = monthLabel(analysisStart);

    const analyzed = new Map<string, number>();
    const trailing = new Map<string, number>();
    const categoryNames = new Map<string, string>();
    for (const row of rows) {
      if (row.type !== TransactionType.EXPENSE) continue;
      const inAnalysis = row.occurredAt >= analysisStart && row.occurredAt < analysisEnd;
      const inTrailing = row.occurredAt >= trailingStart && row.occurredAt < analysisStart;
      if (!inAnalysis && !inTrailing) continue;
      const key = row.category?.id ?? "uncategorized";
      categoryNames.set(key, row.category?.name ?? "Uncategorized");
      const amount = convert(Number(row.amount), row.currency ?? "USD");
      if (inAnalysis) analyzed.set(key, (analyzed.get(key) ?? 0) + amount);
      else trailing.set(key, (trailing.get(key) ?? 0) + amount);
    }

    const unusual: { id: string; name: string; current: number; average: number; delta: number }[] = [];
    for (const [id, current] of analyzed) {
      const total = trailing.get(id) ?? 0;
      const average = total / TRAILING_MONTHS;
      const delta = current - average;
      if (average <= 0 || current < average * UNUSUAL_SPEND_RATIO || delta < UNUSUAL_SPEND_MIN_DELTA) continue;
      unusual.push({ id, name: categoryNames.get(id) ?? "Uncategorized", current, average, delta });
    }
    for (const item of unusual.sort((a, b) => b.delta - a.delta).slice(0, 5)) {
      const percent = Math.round((item.current / item.average - 1) * 100);
      flags.push({
        id: `unusual-spend-${item.id}`,
        kind: "unusual_spend",
        title: `${item.name} was high in ${period}`,
        detail: `${money(item.current, currency)} — ${percent}% above your usual ${money(item.average, currency)} a month over the previous ${TRAILING_MONTHS} months.`,
        href: "/insights",
        amount: item.current,
      });
    }
  }

  // 2. Missed deductions: repeated, business-looking charges not marked deductible.
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - RECURRING_WINDOW_MONTHS, 1));
  const candidates = new Map<string, { merchant: string; category: string; total: number; count: number }>();
  for (const row of rows) {
    if (row.type !== TransactionType.EXPENSE || row.isTaxable || row.occurredAt < cutoff) continue;
    const merchant = (row.merchant ?? row.description ?? "").trim();
    if (!merchant) continue;
    const categoryName = row.category?.name ?? "";
    const haystack = `${merchant} ${row.description ?? ""} ${categoryName}`.toLowerCase();
    if (!DEDUCTION_KEYWORDS.some((keyword) => haystack.includes(keyword))) continue;
    const key = merchant.toLowerCase();
    const amount = convert(Number(row.amount), row.currency ?? "USD");
    const existing = candidates.get(key);
    if (existing) {
      existing.total += amount;
      existing.count += 1;
      continue;
    }
    candidates.set(key, { merchant, category: categoryName || "Uncategorized", total: amount, count: 1 });
  }
  for (const item of [...candidates.values()].filter((entry) => entry.count >= MIN_RECURRING_CHARGES).sort((a, b) => b.total - a.total).slice(0, 3)) {
    flags.push({
      id: `missed-deduction-${item.merchant.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      kind: "missed_deduction",
      title: "Possible missed deduction",
      detail: `${item.merchant} — ${money(item.total, currency)} across ${item.count} ${item.category} charges isn't marked as a deductible expense.`,
      href: "/transactions",
      amount: item.total,
    });
  }

  return { flags: flags.slice(0, MAX_FLAGS), currency, periodLabel: period, asOf: now.toISOString() };
}
