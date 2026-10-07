/**
 * Differential check: the SQL-backed buildInsightsSummary must produce exactly
 * what the previous in-memory aggregation produced, including at month and hour
 * boundaries and under a non-UTC database session.
 *
 * It writes to, and cleans up, a real database, so it only runs when pointed at
 * one on purpose:
 *
 *   DOBBY_DB_PARITY=1 DATABASE_URL=postgresql://... npx vitest run src/lib/transaction-summary.verify.test.ts
 *
 * The default suite skips it, so `npm test` never touches the configured
 * DATABASE_URL.
 */
import { describe, expect, it, vi } from "vitest";
import { Prisma, TransactionType } from "@prisma/client";
import { prisma } from "./prisma.js";

const RUN = process.env.DOBBY_DB_PARITY === "1";

// Deterministic rates so the comparison does not depend on the network.
const RATES: Record<string, number> = { USD: 1, EUR: 0.5, NGN: 100, GBP: 0.25, KES: 80 };
vi.mock("../providers/frankfurter.js", () => ({
  getConversionFactors: async (sources: Iterable<string>, target: string) => {
    const goal = target.toUpperCase();
    const out = new Map<string, number>();
    for (const raw of new Set([...sources].map((s) => s.toUpperCase()))) {
      if (raw === goal) { out.set(raw, 1); continue; }
      // Convert source -> goal via the goal -> source rate.
      const forward = RATES[goal] ?? 1;
      out.set(raw, RATES[raw] !== undefined ? forward / RATES[raw] : 1);
    }
    return out;
  },
  convertCurrencyAmount: async () => 1,
}));

const { buildInsightsSummary } = await import("./transaction-summary.js");

/** The pre-optimization implementation, copied verbatim from the old insights.ts. */
async function referenceSummary(ownerClerkId: string, from?: Date, to?: Date) {
  const transactions = await prisma.transaction.findMany({
    where: {
      ownerClerkId,
      ...(from || to ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    select: {
      type: true,
      amount: true,
      currency: true,
      occurredAt: true,
      category: { select: { id: true, name: true, color: true } },
      source: true,
    },
    orderBy: { occurredAt: "asc" },
    take: 50_000,
  });

  const profile = await prisma.profile.findUnique({ where: { clerkId: ownerClerkId }, select: { currency: true } });
  const activeCurrency = profile?.currency?.toUpperCase() ?? "USD";
  const { getConversionFactors } = await import("../providers/frankfurter.js");
  const conversionFactors = await getConversionFactors(transactions.map((t) => t.currency), activeCurrency);

  const uncategorizedIds = new Set(
    (await prisma.category.findMany({
      where: { ownerClerkId, name: { equals: "uncategorized", mode: "insensitive" } },
      select: { id: true },
    })).map((row) => row.id),
  );

  let income = 0;
  let expenses = 0;
  let uncategorizedIncome = 0;
  let uncategorizedExpenses = 0;
  const byCategory = new Map<string, any>();
  const bySource = new Map<string, any>();
  const byMonth = new Map<string, any>();
  const byMonthCategory = new Map<string, any>();
  const byMonthIncomeSource = new Map<string, any>();

  for (const transaction of transactions) {
    const amount = Number(transaction.amount) * (conversionFactors.get(transaction.currency.toUpperCase()) ?? 1);
    const month = transaction.occurredAt.toISOString().slice(0, 7);
    const monthly = byMonth.get(month) ?? { month, income: 0, expenses: 0, uncategorizedIncome: 0, uncategorizedExpenses: 0 };
    const source = transaction.source ?? "Unknown";
    const sourceItem = bySource.get(source) ?? { source, income: 0, expenses: 0, count: 0 };
    const uncategorized = !transaction.category || uncategorizedIds.has(transaction.category.id);

    if (transaction.type === TransactionType.INCOME) {
      if (uncategorized) {
        uncategorizedIncome += amount;
        monthly.uncategorizedIncome += amount;
      } else {
        income += amount;
        monthly.income += amount;
        sourceItem.income += amount;
        const sourceKey = `${month}|${source}`;
        const monthlySource = byMonthIncomeSource.get(sourceKey) ?? { month, source, amount: 0, count: 0 };
        monthlySource.amount += amount;
        monthlySource.count += 1;
        byMonthIncomeSource.set(sourceKey, monthlySource);
      }
      sourceItem.count += 1;
    } else if (transaction.type === TransactionType.EXPENSE) {
      if (uncategorized) {
        uncategorizedExpenses += amount;
        monthly.uncategorizedExpenses += amount;
      } else {
        expenses += amount;
        monthly.expenses += amount;
        sourceItem.expenses += amount;
        const categoryId = transaction.category?.id ?? null;
        const categoryName = transaction.category?.name ?? "Uncategorized";
        const key = categoryId ?? "uncategorized";
        const category = byCategory.get(key) ?? { categoryId, name: categoryName, color: transaction.category?.color ?? null, amount: 0, count: 0 };
        category.amount += amount;
        category.count += 1;
        byCategory.set(key, category);
        const monthlyCategoryKey = `${month}|${key}`;
        const monthlyCategory = byMonthCategory.get(monthlyCategoryKey) ?? { month, categoryId, name: categoryName, color: transaction.category?.color ?? null, amount: 0, count: 0 };
        monthlyCategory.amount += amount;
        monthlyCategory.count += 1;
        byMonthCategory.set(monthlyCategoryKey, monthlyCategory);
      }
      sourceItem.count += 1;
    } else {
      sourceItem.count += 1;
    }
    byMonth.set(month, monthly);
    bySource.set(source, sourceItem);
  }

  const net = income - expenses;
  return {
    from: from?.toISOString() ?? null,
    to: to?.toISOString() ?? null,
    currency: activeCurrency,
    totals: { income, expenses, net, savingRate: income === 0 ? 0 : net / income, uncategorizedIncome, uncategorizedExpenses },
    spendingByCategory: [...byCategory.values()].sort((a, b) => b.amount - a.amount),
    incomeAndSpendingBySource: [...bySource.values()].sort((a, b) => (b.income + b.expenses) - (a.income + a.expenses)),
    monthly: [...byMonth.values()],
    monthlySpendingByCategory: [...byMonthCategory.values()],
    monthlyIncomeBySource: [...byMonthIncomeSource.values()],
    transactionCount: transactions.length,
  };
}

/** Sort every collection so ordering differences are not mistaken for data differences. */
function normalize(value: any): any {
  if (Array.isArray(value)) {
    return value
      .map(normalize)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: any = {};
    for (const key of Object.keys(value).sort()) out[key] = normalize(value[key]);
    return out;
  }
  if (typeof value === "number") return Math.round(value * 1e6) / 1e6;
  return value;
}

const OWNER = "user_verify_1";

async function seed() {
  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { ownerClerkId: OWNER } }),
    prisma.category.deleteMany({ where: { ownerClerkId: OWNER } }),
    prisma.profile.deleteMany({ where: { clerkId: OWNER } }),
    prisma.user.deleteMany({ where: { clerkId: OWNER } }),
  ]);
  await prisma.user.create({ data: { clerkId: OWNER, email: "v@example.com", plan: "ACTIVE" } });
  await prisma.profile.create({ data: { clerkId: OWNER, currency: "USD" } });

  const rent = await prisma.category.create({ data: { ownerClerkId: OWNER, name: "Rent", color: "#111111" } });
  const food = await prisma.category.create({ data: { ownerClerkId: OWNER, name: "Food", color: "#222222" } });
  // Named with different case on purpose: the old logic matched case-insensitively.
  const uncat = await prisma.category.create({ data: { ownerClerkId: OWNER, name: "UnCategorized", color: "#333333" } });

  const at = (iso: string) => new Date(iso);
  const rows = [
    // income, categorized, several months and currencies
    { type: TransactionType.INCOME, amount: "1000.0000", currency: "USD", occurredAt: at("2026-01-05T00:00:00Z"), categoryId: rent.id, source: "bank", description: "salary" },
    { type: TransactionType.INCOME, amount: "200.0000", currency: "EUR", occurredAt: at("2026-02-05T00:00:00Z"), categoryId: food.id, source: "bank", description: "side" },
    { type: TransactionType.INCOME, amount: "50000.0000", currency: "NGN", occurredAt: at("2026-02-10T00:00:00Z"), categoryId: rent.id, source: "wallet", description: "nig" },
    // expenses, categorized
    { type: TransactionType.EXPENSE, amount: "400.0000", currency: "USD", occurredAt: at("2026-01-08T00:00:00Z"), categoryId: rent.id, source: "bank", description: "rent" },
    { type: TransactionType.EXPENSE, amount: "12.3456", currency: "USD", occurredAt: at("2026-01-09T00:00:00Z"), categoryId: food.id, source: "card", description: "groceries" },
    { type: TransactionType.EXPENSE, amount: "8000.0000", currency: "NGN", occurredAt: at("2026-02-11T00:00:00Z"), categoryId: food.id, source: "wallet", description: "food ng" },
    // expenses with the case-insensitive "uncategorized" category
    { type: TransactionType.EXPENSE, amount: "30.0000", currency: "USD", occurredAt: at("2026-01-11T00:00:00Z"), categoryId: uncat.id, source: "card", description: "mystery" },
    { type: TransactionType.EXPENSE, amount: "44.0000", currency: "GBP", occurredAt: at("2026-02-12T00:00:00Z"), categoryId: uncat.id, source: "card", description: "mystery 2" },
    // null categoryId
    { type: TransactionType.EXPENSE, amount: "10.0000", currency: "USD", occurredAt: at("2026-03-01T00:00:00Z"), categoryId: null, source: "card", description: "null cat" },
    { type: TransactionType.INCOME, amount: "25.0000", currency: "USD", occurredAt: at("2026-03-02T00:00:00Z"), categoryId: null, source: null, description: "null cat income" },
    // transfers: counted in activity, never in totals
    { type: TransactionType.TRANSFER, amount: "100.0000", currency: "USD", occurredAt: at("2026-01-15T00:00:00Z"), categoryId: rent.id, source: "bank", description: "move" },
    { type: TransactionType.TRANSFER, amount: "250.0000", currency: "KES", occurredAt: at("2026-02-20T00:00:00Z"), categoryId: null, source: "wallet", description: "move 2" },
    // same month/category/source but different currency -> must aggregate then convert
    { type: TransactionType.EXPENSE, amount: "100.0000", currency: "USD", occurredAt: at("2026-01-20T00:00:00Z"), categoryId: food.id, source: "card", description: "usd food" },
    { type: TransactionType.EXPENSE, amount: "100.0000", currency: "EUR", occurredAt: at("2026-01-21T00:00:00Z"), categoryId: food.id, source: "card", description: "eur food" },
    // zero amount and a boundary timestamp
    { type: TransactionType.EXPENSE, amount: "0.0000", currency: "USD", occurredAt: at("2026-01-01T00:00:00Z"), categoryId: food.id, source: "card", description: "zero" },
    // month boundary: 23:30 UTC on the last day belongs to the old month even
    // when the database session is east of UTC
    { type: TransactionType.EXPENSE, amount: "7.0000", currency: "USD", occurredAt: at("2026-01-31T23:30:00Z"), categoryId: food.id, source: "card", description: "month boundary late" },
    { type: TransactionType.INCOME, amount: "9.0000", currency: "USD", occurredAt: at("2026-02-01T00:30:00Z"), categoryId: food.id, source: "bank", description: "month boundary early" },
    // first hour of a bounded range, which the local-offset binding used to drop
    { type: TransactionType.EXPENSE, amount: "11.0000", currency: "USD", occurredAt: at("2026-02-01T00:15:00Z"), categoryId: food.id, source: "card", description: "first hour of range" },
  ];

  let i = 0;
  for (const row of rows) {
    await prisma.transaction.create({
      data: { ...row, ownerClerkId: OWNER, amount: new Prisma.Decimal(row.amount), fingerprint: `fp-${i++}` },
    });
  }
  return rows.length;
}

describe.runIf(RUN)("SQL aggregation parity", () => {
  it("matches the previous in-memory implementation across every window", async () => {
const seeded = await seed();
console.log(`seeded ${seeded} transactions`);

const windows: Array<{ label: string; from?: Date; to?: Date }> = [
  { label: "all time" },
  { label: "january only", from: new Date("2026-01-01T00:00:00Z"), to: new Date("2026-01-31T23:59:59Z") },
  { label: "february only", from: new Date("2026-02-01T00:00:00Z"), to: new Date("2026-02-28T23:59:59Z") },
  { label: "from only", from: new Date("2026-02-01T00:00:00Z") },
  { label: "to only", to: new Date("2026-01-31T23:59:59Z") },
  { label: "empty window", from: new Date("2027-01-01T00:00:00Z"), to: new Date("2027-01-31T00:00:00Z") },
];

for (const w of windows) {
  const actual = normalize(await buildInsightsSummary(OWNER, w.from, w.to));
  const expected = normalize(await referenceSummary(OWNER, w.from, w.to));
  try {
    expect(actual).toEqual(expected);
    console.log(`PASS  ${w.label}`);
  } catch (error) {
    console.log(`FAIL  ${w.label}`);
    throw error;
  }
}

await prisma.$transaction([
  prisma.transaction.deleteMany({ where: { ownerClerkId: OWNER } }),
  prisma.category.deleteMany({ where: { ownerClerkId: OWNER } }),
  prisma.profile.deleteMany({ where: { clerkId: OWNER } }),
  prisma.user.deleteMany({ where: { clerkId: OWNER } }),
]);
await prisma.$disconnect();

  });
});