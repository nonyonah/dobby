import { TransactionType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const insightsRouter = Router();
insightsRouter.use(requireAuth);

const rangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

insightsRouter.get("/summary", async (req, res) => {
  const { from, to } = rangeSchema.parse(req.query);
  const ownerClerkId = req.auth!.userId;
  const transactions = await prisma.transaction.findMany({
    where: {
      ownerClerkId,
      ...(from || to ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    select: { type: true, amount: true, occurredAt: true, category: { select: { id: true, name: true, color: true } }, source: true },
    orderBy: { occurredAt: "asc" },
    take: 50_000,
  });

  let income = 0;
  let expenses = 0;
  const byCategory = new Map<string, { categoryId: string | null; name: string; color: string | null; amount: number; count: number }>();
  const bySource = new Map<string, { source: string; income: number; expenses: number; count: number }>();
  const byMonth = new Map<string, { month: string; income: number; expenses: number }>();

  for (const transaction of transactions) {
    const amount = Number(transaction.amount);
    const month = transaction.occurredAt.toISOString().slice(0, 7);
    const monthly = byMonth.get(month) ?? { month, income: 0, expenses: 0 };
    const source = transaction.source ?? "Unknown";
    const sourceItem = bySource.get(source) ?? { source, income: 0, expenses: 0, count: 0 };
    sourceItem.count += 1;

    if (transaction.type === TransactionType.INCOME) {
      income += amount;
      monthly.income += amount;
      sourceItem.income += amount;
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
    }
    byMonth.set(month, monthly);
    bySource.set(source, sourceItem);
  }

  const net = income - expenses;
  res.json({
    data: {
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
      totals: { income, expenses, net, savingRate: income === 0 ? 0 : net / income },
      spendingByCategory: [...byCategory.values()].sort((a, b) => b.amount - a.amount),
      incomeAndSpendingBySource: [...bySource.values()].sort((a, b) => (b.income + b.expenses) - (a.income + a.expenses)),
      monthly: [...byMonth.values()],
      transactionCount: transactions.length,
    },
  });
});
