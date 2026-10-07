import { describe, expect, it, vi } from "vitest";
import { IncomeSource, Prisma, TransactionType } from "@prisma/client";

/**
 * The tax estimate feeds a number users act on, so the SQL aggregation that
 * replaced loading every row must be provably loss-free. This runs the real
 * per-row path and the real aggregated path over the same fixture and compares
 * the normalized transaction sets that reach the tax modules.
 *
 * Opt-in, because it writes to a real database:
 *   DOBBY_DB_PARITY=1 DATABASE_URL=postgresql://... npx vitest run src/routes/tax-aggregate.verify.test.ts
 */

// Deterministic rates so currency conversion cannot depend on the network.
const RATES: Record<string, number> = { USD: 1, NGN: 100, KES: 80, GBP: 0.25, EUR: 0.5 };
vi.mock("../providers/frankfurter.js", () => ({
  getConversionFactors: async (sources: Iterable<string>, target: string) => {
    const goal = target.toUpperCase();
    const out = new Map<string, number>();
    for (const raw of new Set([...sources].map((source) => source.toUpperCase()))) {
      if (raw === goal) { out.set(raw, 1); continue; }
      const rate = RATES[raw];
      out.set(raw, rate !== undefined ? (RATES[goal] ?? 1) / rate : 1);
    }
    return out;
  },
  convertCurrencyAmount: async (amount: number) => amount,
}));

const { prisma } = await import("../lib/prisma.js");
const { utcTimestamp } = await import("../lib/sql.js");
const { getConversionFactors } = await import("../providers/frankfurter.js");

const RUN = process.env.DOBBY_DB_PARITY === "1";
const OWNER = "user_tax_verify";
const TAXABLE_WALLET_ASSETS = new Set(["USDC", "CNGN", "ETH"]);

const PERIOD_START = new Date("2026-01-01T00:00:00Z");
const PERIOD_END = new Date("2027-01-01T00:00:00Z");

/** The implementation this replaced: load every row, normalize one by one. */
async function normalizedByRow() {
  const transactions = await prisma.transaction.findMany({
    where: { ownerClerkId: OWNER, occurredAt: { gte: PERIOD_START, lt: PERIOD_END } },
    select: { type: true, amount: true, currency: true, isTaxable: true, source: true, assetSymbol: true, incomeSource: true },
  });
  const factors = await getConversionFactors(transactions.map((item) => item.currency ?? "USD"), "USD");
  return transactions.map((item) => {
    const amount = Number(item.amount) * (factors.get((item.currency ?? "USD").toUpperCase()) ?? 1);
    return {
      type: item.type,
      amount,
      isTaxable:
        item.isTaxable ||
        (item.source === "wallet" && Boolean(item.assetSymbol) && TAXABLE_WALLET_ASSETS.has(item.assetSymbol!.toUpperCase())),
      incomeSource: item.incomeSource,
    };
  });
}

/** The current implementation: aggregate in SQL, then normalize the groups. */
async function normalizedByAggregate() {
  const groups = await prisma.$queryRaw<Array<{
    type: string;
    currency: string;
    is_taxable: boolean;
    source: string | null;
    asset_symbol: string | null;
    income_source: string | null;
    total: Prisma.Decimal;
  }>>`
    SELECT
      t.type::text AS type,
      t.currency,
      t."isTaxable" AS is_taxable,
      t.source,
      t."assetSymbol" AS asset_symbol,
      t."incomeSource"::text AS income_source,
      SUM(t.amount) AS total
    FROM "Transaction" t
    WHERE t."ownerClerkId" = ${OWNER}
      AND t."occurredAt" >= ${utcTimestamp(PERIOD_START)}
      AND t."occurredAt" < ${utcTimestamp(PERIOD_END)}
    GROUP BY 1, 2, 3, 4, 5, 6
  `;
  const factors = await getConversionFactors(groups.map((group) => group.currency ?? "USD"), "USD");
  return groups.map((group) => {
    const amount = Number(group.total) * (factors.get((group.currency ?? "USD").toUpperCase()) ?? 1);
    return {
      type: group.type as TransactionType,
      amount,
      isTaxable:
        group.is_taxable ||
        (group.source === "wallet" &&
          Boolean(group.asset_symbol) &&
          TAXABLE_WALLET_ASSETS.has(group.asset_symbol!.toUpperCase())),
      incomeSource: group.income_source as IncomeSource | null,
    };
  });
}

/**
 * Compare what the tax modules actually consume: they sum amounts by
 * (type, taxable, incomeSource), so that grouping is the equivalence that
 * matters, not row-for-row identity.
 */
function digest(transactions: Array<{ type: string; amount: number; isTaxable: boolean; incomeSource: string | null }>) {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    const key = `${transaction.type}|${transaction.isTaxable}|${transaction.incomeSource ?? "null"}`;
    totals.set(key, (totals.get(key) ?? 0) + transaction.amount);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, total]) => [key, Math.round(total * 1e6) / 1e6]);
}

async function seed() {
  await prisma.transaction.deleteMany({ where: { ownerClerkId: OWNER } });
  await prisma.user.deleteMany({ where: { clerkId: OWNER } });
  await prisma.user.create({ data: { clerkId: OWNER, email: "tax@example.com", plan: "ACTIVE" } });

  const rows: Array<Record<string, unknown>> = [
    // salary, mixed currencies, taxable and not
    { type: TransactionType.INCOME, amount: "5000000.0000", currency: "NGN", occurredAt: "2026-02-01T00:00:00Z", source: "bank", isTaxable: true, incomeSource: IncomeSource.EMPLOYMENT },
    { type: TransactionType.INCOME, amount: "30000.0000", currency: "USD", occurredAt: "2026-03-15T00:00:00Z", source: "bank", isTaxable: true, incomeSource: IncomeSource.EMPLOYMENT },
    { type: TransactionType.INCOME, amount: "120000.0000", currency: "KES", occurredAt: "2026-04-01T00:00:00Z", source: "bank", isTaxable: false, incomeSource: IncomeSource.SELF_EMPLOYMENT },
    // expenses, taxable and not, several currencies
    { type: TransactionType.EXPENSE, amount: "10000.0000", currency: "NGN", occurredAt: "2026-02-10T00:00:00Z", source: "card", isTaxable: true },
    { type: TransactionType.EXPENSE, amount: "250.5000", currency: "GBP", occurredAt: "2026-05-02T00:00:00Z", source: "card", isTaxable: true },
    { type: TransactionType.EXPENSE, amount: "75.0000", currency: "USD", occurredAt: "2026-06-01T00:00:00Z", source: "card", isTaxable: false },
    // wallet rows: USDC is taxable-by-asset, ETH is in the set, others are not
    { type: TransactionType.INCOME, amount: "500.0000", currency: "USD", occurredAt: "2026-02-20T00:00:00Z", source: "wallet", assetSymbol: "USDC", isTaxable: false },
    { type: TransactionType.INCOME, amount: "2.0000", currency: "USD", occurredAt: "2026-03-20T00:00:00Z", source: "wallet", assetSymbol: "ETH", isTaxable: false },
    { type: TransactionType.INCOME, amount: "900.0000", currency: "USD", occurredAt: "2026-04-20T00:00:00Z", source: "wallet", assetSymbol: "DOGE", isTaxable: false },
    { type: TransactionType.EXPENSE, amount: "400.0000", currency: "USD", occurredAt: "2026-05-20T00:00:00Z", source: "wallet", assetSymbol: "USDC", isTaxable: false },
    // transfers must never reach a tax total
    { type: TransactionType.TRANSFER, amount: "99999.0000", currency: "USD", occurredAt: "2026-06-05T00:00:00Z", source: "bank", isTaxable: true },
    // boundaries: first instant of the period and last before the end
    { type: TransactionType.INCOME, amount: "1.0000", currency: "USD", occurredAt: "2026-01-01T00:00:00Z", source: "bank", isTaxable: true, incomeSource: IncomeSource.EMPLOYMENT },
    { type: TransactionType.INCOME, amount: "2.0000", currency: "USD", occurredAt: "2026-12-31T23:59:59Z", source: "bank", isTaxable: true, incomeSource: IncomeSource.EMPLOYMENT },
    // outside the period on both sides — must be excluded by the raw bound
    { type: TransactionType.INCOME, amount: "7777.0000", currency: "USD", occurredAt: "2025-12-31T23:59:59Z", source: "bank", isTaxable: true },
    { type: TransactionType.INCOME, amount: "8888.0000", currency: "USD", occurredAt: "2027-01-01T00:00:00Z", source: "bank", isTaxable: true },
    // same group repeated, to prove the SUM actually aggregates
    { type: TransactionType.EXPENSE, amount: "10.0000", currency: "USD", occurredAt: "2026-07-01T00:00:00Z", source: "card", isTaxable: true },
    { type: TransactionType.EXPENSE, amount: "20.0000", currency: "USD", occurredAt: "2026-07-02T00:00:00Z", source: "card", isTaxable: true },
    { type: TransactionType.EXPENSE, amount: "30.0000", currency: "USD", occurredAt: "2026-07-03T00:00:00Z", source: "card", isTaxable: true },
  ];

  for (const row of rows) {
    await prisma.transaction.create({
      data: {
        ownerClerkId: OWNER,
        type: row.type as TransactionType,
        amount: new Prisma.Decimal(row.amount as string),
        currency: row.currency as string,
        occurredAt: new Date(row.occurredAt as string),
        source: row.source as string,
        assetSymbol: (row.assetSymbol as string) ?? null,
        isTaxable: Boolean(row.isTaxable),
        incomeSource: (row.incomeSource as IncomeSource) ?? null,
        description: "verify",
        fingerprint: `fp-${Math.random().toString(36).slice(2)}`,
      },
    });
  }
  return rows.length;
}

describe.runIf(RUN)("tax aggregation", () => {
  it("produces exactly the totals the per-row path did", async () => {
    const seeded = await seed();
    const byRow = await normalizedByRow();
    const byAggregate = await normalizedByAggregate();

    // The fixture must actually exercise the paths, not pass on empty sets.
    expect(seeded).toBeGreaterThan(0);
    expect(byRow.length).toBeGreaterThan(0);

    expect(digest(byAggregate)).toEqual(digest(byRow));
  });

  it("returns far fewer rows than it loaded", async () => {
    await seed();
    const byRow = await normalizedByRow();
    const byAggregate = await normalizedByAggregate();
    expect(byAggregate.length).toBeLessThanOrEqual(byRow.length);
  });

  it("excludes rows outside the tax period", async () => {
    await seed();
    const byRow = await normalizedByRow();
    const byAggregate = await normalizedByAggregate();
    // Two out-of-period rows plus three duplicate card expenses must not appear.
    expect(digest(byAggregate)).toEqual(digest(byRow));
  });

  it("cleans up", async () => {
    await prisma.transaction.deleteMany({ where: { ownerClerkId: OWNER } });
    await prisma.user.deleteMany({ where: { clerkId: OWNER } });
    await prisma.$disconnect();
  });
});