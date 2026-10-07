import { Prisma, TransactionType } from "@prisma/client";
import { prisma } from "./prisma.js";
import { utcTimestamp } from "./sql.js";
import { getConversionFactors } from "../providers/frankfurter.js";

type SummaryAggRow = {
  month: string;
  type: string;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  source: string | null;
  currency: string;
  total: number;
  count: bigint;
};

export type InsightsSummaryResult = {
  from: string | null;
  to: string | null;
  currency: string;
  totals: {
    income: number;
    expenses: number;
    net: number;
    savingRate: number;
    uncategorizedIncome: number;
    uncategorizedExpenses: number;
  };
  spendingByCategory: Array<{ categoryId: string | null; name: string; color: string | null; amount: number; count: number }>;
  incomeAndSpendingBySource: Array<{ source: string; income: number; expenses: number; count: number }>;
  monthly: Array<{ month: string; income: number; expenses: number; uncategorizedIncome: number; uncategorizedExpenses: number }>;
  monthlySpendingByCategory: Array<{ month: string; categoryId: string | null; name: string; color: string | null; amount: number; count: number }>;
  monthlyIncomeBySource: Array<{ month: string; source: string; amount: number; count: number }>;
  transactionCount: number;
};

/**
 * `occurredAt` is a naive UTC `timestamp`, so both the month label and the range
 * bounds have to be handled in UTC terms — see lib/sql.ts for the two traps
 * this avoids.
 */
async function fetchSummaryAggRows(ownerClerkId: string, from?: Date, to?: Date): Promise<SummaryAggRow[]> {
  const filters: Prisma.Sql[] = [Prisma.sql`t."ownerClerkId" = ${ownerClerkId}`];
  if (from) filters.push(Prisma.sql`t."occurredAt" >= ${utcTimestamp(from)}`);
  if (to) filters.push(Prisma.sql`t."occurredAt" <= ${utcTimestamp(to)}`);
  const where = Prisma.join(filters, " AND ");

  return prisma.$queryRaw<SummaryAggRow[]>`
    SELECT
      to_char(t."occurredAt", 'YYYY-MM') AS month,
      t.type::text AS type,
      t."categoryId" AS category_id,
      c.name AS category_name,
      c.color AS category_color,
      t.source,
      t.currency,
      SUM(t.amount)::double precision AS total,
      COUNT(*)::bigint AS count
    FROM "Transaction" t
    LEFT JOIN "Category" c ON c.id = t."categoryId"
    WHERE ${where}
    GROUP BY 1, 2, 3, 4, 5, 6, 7
  `;
}

export async function buildInsightsSummary(
  ownerClerkId: string,
  from?: Date,
  to?: Date,
): Promise<InsightsSummaryResult> {
  const [profile, uncategorizedRows, aggRows] = await Promise.all([
    prisma.profile.findUnique({ where: { clerkId: ownerClerkId }, select: { currency: true } }),
    prisma.category.findMany({
      where: { ownerClerkId, name: { equals: "uncategorized", mode: "insensitive" } },
      select: { id: true },
    }),
    fetchSummaryAggRows(ownerClerkId, from, to),
  ]);

  const activeCurrency = profile?.currency?.toUpperCase() ?? "USD";
  const uncategorizedIds = new Set(uncategorizedRows.map((row) => row.id));
  const conversionFactors = await getConversionFactors(aggRows.map((row) => row.currency), activeCurrency);

  let income = 0;
  let expenses = 0;
  let uncategorizedIncome = 0;
  let uncategorizedExpenses = 0;
  let transactionCount = 0;
  const byCategory = new Map<string, { categoryId: string | null; name: string; color: string | null; amount: number; count: number }>();
  const bySource = new Map<string, { source: string; income: number; expenses: number; count: number }>();
  const byMonth = new Map<string, { month: string; income: number; expenses: number; uncategorizedIncome: number; uncategorizedExpenses: number }>();
  const byMonthCategory = new Map<string, { month: string; categoryId: string | null; name: string; color: string | null; amount: number; count: number }>();
  const byMonthIncomeSource = new Map<string, { month: string; source: string; amount: number; count: number }>();

  for (const row of aggRows) {
    const rowCount = Number(row.count);
    transactionCount += rowCount;
    const amount = Number(row.total) * (conversionFactors.get(row.currency.toUpperCase()) ?? 1);
    const month = row.month;
    const monthly = byMonth.get(month) ?? { month, income: 0, expenses: 0, uncategorizedIncome: 0, uncategorizedExpenses: 0 };
    const source = row.source ?? "Unknown";
    const sourceItem = bySource.get(source) ?? { source, income: 0, expenses: 0, count: 0 };
    const uncategorized = !row.category_id || uncategorizedIds.has(row.category_id);

    if (row.type === TransactionType.INCOME) {
      sourceItem.count += rowCount;
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
        monthlySource.count += rowCount;
        byMonthIncomeSource.set(sourceKey, monthlySource);
      }
    } else if (row.type === TransactionType.EXPENSE) {
      sourceItem.count += rowCount;
      if (uncategorized) {
        uncategorizedExpenses += amount;
        monthly.uncategorizedExpenses += amount;
      } else {
        expenses += amount;
        monthly.expenses += amount;
        sourceItem.expenses += amount;
        const categoryId = row.category_id;
        const categoryName = row.category_name ?? "Uncategorized";
        const key = categoryId ?? "uncategorized";
        const category = byCategory.get(key) ?? { categoryId, name: categoryName, color: row.category_color ?? null, amount: 0, count: 0 };
        category.amount += amount;
        category.count += rowCount;
        byCategory.set(key, category);
        const monthlyCategoryKey = `${month}|${key}`;
        const monthlyCategory = byMonthCategory.get(monthlyCategoryKey) ?? {
          month,
          categoryId,
          name: categoryName,
          color: row.category_color ?? null,
          amount: 0,
          count: 0,
        };
        monthlyCategory.amount += amount;
        monthlyCategory.count += rowCount;
        byMonthCategory.set(monthlyCategoryKey, monthlyCategory);
      }
    } else {
      sourceItem.count += rowCount;
    }
    byMonth.set(month, monthly);
    bySource.set(source, sourceItem);
  }

  const net = income - expenses;
  return {
    from: from?.toISOString() ?? null,
    to: to?.toISOString() ?? null,
    currency: activeCurrency,
    totals: {
      income,
      expenses,
      net,
      savingRate: income === 0 ? 0 : net / income,
      uncategorizedIncome,
      uncategorizedExpenses,
    },
    spendingByCategory: [...byCategory.values()].sort((a, b) => b.amount - a.amount),
    incomeAndSpendingBySource: [...bySource.values()].sort((a, b) => (b.income + b.expenses) - (a.income + a.expenses)),
    monthly: [...byMonth.values()],
    monthlySpendingByCategory: [...byMonthCategory.values()],
    monthlyIncomeBySource: [...byMonthIncomeSource.values()],
    transactionCount,
  };
}

/** Month-level income/expense totals and spending by category name (for AI copy). */
export async function buildMonthlyTotals(
  ownerClerkId: string,
  start: Date,
  end: Date,
): Promise<{ currency: string; income: number; expenses: number; categories: Map<string, number> }> {
  const [profile, aggRows] = await Promise.all([
    prisma.profile.findUnique({ where: { clerkId: ownerClerkId }, select: { currency: true } }),
    fetchSummaryAggRows(ownerClerkId, start, end),
  ]);
  const activeCurrency = profile?.currency?.toUpperCase() ?? "USD";
  const conversionFactors = await getConversionFactors(aggRows.map((row) => row.currency), activeCurrency);
  let income = 0;
  let expenses = 0;
  const categories = new Map<string, number>();
  for (const row of aggRows) {
    const amount = Number(row.total) * (conversionFactors.get(row.currency.toUpperCase()) ?? 1);
    if (row.type === TransactionType.INCOME) income += amount;
    if (row.type === TransactionType.EXPENSE) {
      expenses += amount;
      const category = row.category_name ?? "Uncategorized";
      categories.set(category, (categories.get(category) ?? 0) + amount);
    }
  }
  return { currency: activeCurrency, income, expenses, categories };
}
