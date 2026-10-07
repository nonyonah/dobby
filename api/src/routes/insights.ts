import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { assertPro } from "../middleware/plan.js";
import { buildNetWorthSnapshot } from "../lib/net-worth.js";
import { computeProactiveFlags } from "../lib/flags.js";
import { buildInsightsSummary, buildMonthlyTotals } from "../lib/transaction-summary.js";
import { generateGatewaySummary } from "../providers/ai-gateway.js";

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
  const { currency, income, expenses, categories } = await buildMonthlyTotals(req.auth!.userId, start, end);
  const summary = await generateGatewaySummary(`Write a concise monthly personal-finance summary for ${month} in 3-5 bullet points. Income: ${income}. Expenses: ${expenses}. Net: ${income - expenses}. Spending by category: ${JSON.stringify(Object.fromEntries(categories))}. Do not invent facts or give financial advice.`);
  res.json({ data: { month, currency, income, expenses, net: income - expenses, summary } });
});

insightsRouter.get("/summary", async (req, res) => {
  const { from, to } = rangeSchema.parse(req.query);
  res.json({ data: await buildInsightsSummary(req.auth!.userId, from, to) });
});

/** Net worth for the greeting: wallet stablecoin balances plus ledger positions. */
insightsRouter.get("/net-worth", async (req, res) => {
  res.json({ data: await buildNetWorthSnapshot(req.auth!.userId) });
});

/** Pro: unusual spending and missed deduction candidates, computed from the ledger. */
insightsRouter.get("/flags", async (req, res) => {
  await assertPro(req.auth?.userId, "Proactive AI flags");
  res.json({ data: await computeProactiveFlags(req.auth!.userId) });
});
