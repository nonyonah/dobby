import { TransactionType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { assertPro } from "../middleware/plan.js";
import { buildNetWorthSnapshot } from "../lib/net-worth.js";
import { computeProactiveFlags } from "../lib/flags.js";
import { generateGatewaySummary } from "../providers/ai-gateway.js";
import { convertCurrencyAmount } from "../providers/frankfurter.js";

export const insightsRouter = Router();
insightsRouter.use(requireAuth);

const rangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

insightsRouter.get("/monthly-summary", async (req, res) => {
  const month = z.string().regex(/^\d{4}-\d{2}$/).parse(req.query.month);
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const transactions = await prisma.transaction.findMany({ where: { ownerClerkId: req.auth!.userId, occurredAt: { gte: start, lt: end } }, select: { type: true, amount: true, currency: true, description: true, category: { select: { name: true } } }, orderBy: { occurredAt: "asc" }, take: 10_000 });
  const profile = await prisma.profile.findUnique({ where: { clerkId: req.auth!.userId }, select: { currency: true } });
  const activeCurrency = profile?.currency?.toUpperCase() ?? "USD";
  const factors = new Map<string, number>();
  for (const currency of new Set(transactions.map((transaction) => transaction.currency.toUpperCase()))) {
    try { factors.set(currency, await convertCurrencyAmount(1, currency, activeCurrency)); } catch { factors.set(currency, 1); }
  }
  let income = 0;
  let expenses = 0;
  const categories = new Map<string, number>();
  for (const transaction of transactions) {
    const amount = Number(transaction.amount) * (factors.get(transaction.currency.toUpperCase()) ?? 1);
    if (transaction.type === TransactionType.INCOME) income += amount;
    if (transaction.type === TransactionType.EXPENSE) {
      expenses += amount;
      const category = transaction.category?.name ?? "Uncategorized";
      categories.set(category, (categories.get(category) ?? 0) + amount);
    }
  }
  const summary = await generateGatewaySummary(`Write a concise monthly personal-finance summary for ${month} in 3-5 bullet points. Income: ${income}. Expenses: ${expenses}. Net: ${income - expenses}. Spending by category: ${JSON.stringify(Object.fromEntries(categories))}. Do not invent facts or give financial advice.`);
  res.json({ data: { month, currency: activeCurrency, income, expenses, net: income - expenses, summary } });
});

insightsRouter.get("/summary", async (req, res) => {
  const { from, to } = rangeSchema.parse(req.query);
  const ownerClerkId = req.auth!.userId;
  const transactions = await prisma.transaction.findMany({
    where: {
      ownerClerkId,
      ...(from || to ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    select: { type: true, amount: true, currency: true, occurredAt: true, category: { select: { id: true, name: true, color: true } }, source: true },
    orderBy: { occurredAt: "asc" },
    take: 50_000,
  });

  const profile = await prisma.profile.findUnique({ where: { clerkId: ownerClerkId }, select: { currency: true } });
  const activeCurrency = profile?.currency?.toUpperCase() ?? "USD";
  const conversionFactors = new Map<string, number>();
  for (const currency of new Set(transactions.map((transaction) => transaction.currency.toUpperCase()))) {
    try { conversionFactors.set(currency, await convertCurrencyAmount(1, currency, activeCurrency)); } catch { conversionFactors.set(currency, 1); }
  }
  let income = 0;
  let expenses = 0;
  const byCategory = new Map<string, { categoryId: string | null; name: string; color: string | null; amount: number; count: number }>();
  const bySource = new Map<string, { source: string; income: number; expenses: number; count: number }>();
  const byMonth = new Map<string, { month: string; income: number; expenses: number }>();
  const byMonthCategory = new Map<string, { month: string; categoryId: string | null; name: string; color: string | null; amount: number; count: number }>();
  const byMonthIncomeSource = new Map<string, { month: string; source: string; amount: number; count: number }>();

  for (const transaction of transactions) {
    const amount = Number(transaction.amount) * (conversionFactors.get(transaction.currency.toUpperCase()) ?? 1);
    const month = transaction.occurredAt.toISOString().slice(0, 7);
    const monthly = byMonth.get(month) ?? { month, income: 0, expenses: 0 };
    const source = transaction.source ?? "Unknown";
    const sourceItem = bySource.get(source) ?? { source, income: 0, expenses: 0, count: 0 };
    sourceItem.count += 1;

    if (transaction.type === TransactionType.INCOME) {
      income += amount;
      monthly.income += amount;
      sourceItem.income += amount;
      const sourceKey = `${month}|${source}`;
      const monthlySource = byMonthIncomeSource.get(sourceKey) ?? { month, source, amount: 0, count: 0 };
      monthlySource.amount += amount;
      monthlySource.count += 1;
      byMonthIncomeSource.set(sourceKey, monthlySource);
    } else if (transaction.type === TransactionType.EXPENSE) {
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
    byMonth.set(month, monthly);
    bySource.set(source, sourceItem);
  }

  const net = income - expenses;
  res.json({
    data: {
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
      currency: activeCurrency,
      totals: { income, expenses, net, savingRate: income === 0 ? 0 : net / income },
      spendingByCategory: [...byCategory.values()].sort((a, b) => b.amount - a.amount),
      incomeAndSpendingBySource: [...bySource.values()].sort((a, b) => (b.income + b.expenses) - (a.income + a.expenses)),
      monthly: [...byMonth.values()],
      monthlySpendingByCategory: [...byMonthCategory.values()],
      monthlyIncomeBySource: [...byMonthIncomeSource.values()],
      transactionCount: transactions.length,
    },
  });
});

/** Pro: stablecoin balances across connected wallets, from live chain data. */
insightsRouter.get("/net-worth", async (req, res) => {
  await assertPro(req.auth?.userId, "Net worth");
  res.json({ data: await buildNetWorthSnapshot(req.auth!.userId) });
});

/** Pro: unusual spending and missed deduction candidates, computed from the ledger. */
insightsRouter.get("/flags", async (req, res) => {
  await assertPro(req.auth?.userId, "Proactive AI flags");
  res.json({ data: await computeProactiveFlags(req.auth!.userId) });
});
