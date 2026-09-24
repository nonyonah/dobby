import { Prisma, TaxChecklistStatus, TaxCountry } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { getTaxRules } from "../tax/registry.js";
import { generateGatewaySummary } from "../providers/ai-gateway.js";
import { convertCurrencyAmount } from "../providers/frankfurter.js";

export const taxRouter = Router();
taxRouter.use(requireAuth);

const currentYear = () => new Date().getUTCFullYear();
const countrySchema = z.nativeEnum(TaxCountry);
const deductionsSchema = z.record(z.string(), z.unknown());

async function ensureTaxProfile(ownerClerkId: string) {
  const profile = await prisma.taxProfile.upsert({
    where: { ownerClerkId },
    create: { ownerClerkId, country: TaxCountry.NIGERIA, taxYear: currentYear() },
    update: {},
    include: { checklistItems: true },
  });
  const rules = getTaxRules(profile.country);
  await prisma.taxChecklistItem.createMany({
    data: rules.checklist.map((item) => ({ taxProfileId: profile.id, key: item.key, label: item.label })),
    skipDuplicates: true,
  });
  return prisma.taxProfile.findUniqueOrThrow({ where: { id: profile.id }, include: { checklistItems: true } });
}

async function calculate(ownerClerkId: string) {
  const profile = await ensureTaxProfile(ownerClerkId);
  const start = new Date(Date.UTC(profile.taxYear, 0, 1));
  const end = new Date(Date.UTC(profile.taxYear + 1, 0, 1));
  const transactions = await prisma.transaction.findMany({ where: { ownerClerkId, occurredAt: { gte: start, lt: end } }, select: { type: true, amount: true, currency: true, isTaxable: true, source: true, assetSymbol: true } });
  const rules = getTaxRules(profile.country);
  const taxableWalletAssets = new Set(["USDC", "CNGN", "ETH"]);
  const taxCurrency = profile.country === TaxCountry.US ? "USD" : "NGN";
  const normalizedTransactions = await Promise.all(transactions.map(async (item) => {
    let amount = Number(item.amount);
    try { amount = await convertCurrencyAmount(amount, item.currency ?? "USD", taxCurrency); } catch { /* Preserve the stored amount if no rate is available. */ }
    return { type: item.type, amount, isTaxable: item.isTaxable || (item.source === "wallet" && Boolean(item.assetSymbol) && taxableWalletAssets.has(item.assetSymbol!.toUpperCase())) };
  }));
  const result = rules.calculate({ taxYear: profile.taxYear, transactions: normalizedTransactions, deductions: (profile.deductionsCaptured as Record<string, unknown> | null) ?? {}, now: new Date() });
  await prisma.taxProfile.update({ where: { id: profile.id }, data: { estimatedTaxOwed: new Prisma.Decimal(result.estimatedTaxOwed), taxableIncome: new Prisma.Decimal(result.taxableIncome), lastCalculatedAt: new Date() } });
  return { profile, result };
}

taxRouter.get("/profile", async (req, res) => {
  res.json({ data: await ensureTaxProfile(req.auth!.userId) });
});

taxRouter.patch("/profile", async (req, res) => {
  const input = z.object({ country: countrySchema.optional(), deductions: deductionsSchema.optional() }).parse(req.body);
  const existing = await ensureTaxProfile(req.auth!.userId);
  const country = input.country ?? existing.country;
  const rules = getTaxRules(country);
  await prisma.taxProfile.update({ where: { id: existing.id }, data: { country, ...(input.deductions ? { deductionsCaptured: input.deductions as Prisma.InputJsonValue } : {}) } });
  await prisma.taxChecklistItem.createMany({ data: rules.checklist.map((item) => ({ taxProfileId: existing.id, key: item.key, label: item.label })), skipDuplicates: true });
  res.json({ data: await ensureTaxProfile(req.auth!.userId) });
});

taxRouter.get("/estimate", async (req, res) => {
  const { result } = await calculate(req.auth!.userId);
  res.json({ data: result });
});

taxRouter.get("/summary", async (req, res) => {
  const { profile, result } = await calculate(req.auth!.userId);
  const summary = await generateGatewaySummary(`Summarize this informational tax estimate for the user in 3 short bullet points. Country: ${profile.country}. Tax year: ${profile.taxYear}. Taxable income: ${result.taxableIncome}. Estimated tax owed: ${result.estimatedTaxOwed}. Deductions captured: ${JSON.stringify(profile.deductionsCaptured ?? {})}. Mention that the result is an estimate and should be verified with a qualified tax professional.`);
  res.json({ data: { ...result, summary } });
});

taxRouter.get("/checklist", async (req, res) => {
  const profile = await ensureTaxProfile(req.auth!.userId);
  res.json({ data: { country: profile.country, taxYear: profile.taxYear, items: profile.checklistItems } });
});

taxRouter.patch("/checklist/:key", async (req, res) => {
  const status = z.nativeEnum(TaxChecklistStatus).parse(req.body.status);
  const profile = await ensureTaxProfile(req.auth!.userId);
  const item = await prisma.taxChecklistItem.updateMany({ where: { taxProfileId: profile.id, key: req.params.key }, data: { status } });
  if (!item.count) { res.status(404).json({ error: { code: "CHECKLIST_ITEM_NOT_FOUND", message: "Tax checklist item was not found." } }); return; }
  res.json({ data: await prisma.taxChecklistItem.findFirst({ where: { taxProfileId: profile.id, key: req.params.key } }) });
});
