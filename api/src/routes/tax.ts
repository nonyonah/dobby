import { IncomeSource, Prisma, TaxChecklistStatus, TaxCountry } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { getTaxRules, taxCountryForJurisdiction } from "../tax/registry.js";
import { generateGatewaySummary } from "../providers/ai-gateway.js";
import { convertCurrencyAmount } from "../providers/frankfurter.js";

export const taxRouter = Router();
taxRouter.use(requireAuth);

const currentYear = () => new Date().getUTCFullYear();
const countrySchema = z.nativeEnum(TaxCountry);
const deductionsSchema = z.record(z.string(), z.unknown());

/**
 * The tax jurisdiction the user chose in Settings is the source of truth for
 * which country's rules (and tax currency) apply. The tax module keeps its own
 * TaxProfile, so mirror the jurisdiction onto it on every read — otherwise a
 * profile whose jurisdiction is "kenya" is still estimated in NGN from a stale
 * TaxProfile.country.
 */
async function taxCountryFor(ownerClerkId: string): Promise<TaxCountry> {
  const profile = await prisma.profile.findUnique({ where: { clerkId: ownerClerkId }, select: { taxJurisdiction: true } });
  return taxCountryForJurisdiction(profile?.taxJurisdiction);
}

async function ensureTaxProfile(ownerClerkId: string) {
  const country = await taxCountryFor(ownerClerkId);
  const profile = await prisma.taxProfile.upsert({
    where: { ownerClerkId },
    create: { ownerClerkId, country, taxYear: currentYear() },
    update: { country },
  });
  const rules = getTaxRules(profile.country);
  // Each jurisdiction has its own checklist, so switching does not delete the
  // previous country's rows — the user researching a second country must not
  // lose their progress on the first. Rows for other countries are simply not
  // returned.
  const keys = rules.checklist.map((item) => item.key);
  await prisma.taxChecklistItem.createMany({
    data: rules.checklist.map((item) => ({ taxProfileId: profile.id, country, key: item.key, label: item.label })),
    skipDuplicates: true,
  });
  // The module's list is the source of truth, so anything else is pruned. This
  // is not a migration clean-up: older rows accumulated every country's keys
  // into one list (the previous delete-on-switch was a no-op, because Settings
  // writes TaxProfile.country before this ran), so a profile can still be
  // carrying a union of checklists. Enforcing the invariant on every read means
  // a stale or renamed key cannot survive to be shown to the user.
  await prisma.taxChecklistItem.deleteMany({
    where: { taxProfileId: profile.id, country, key: { notIn: keys } },
  });
  return prisma.taxProfile.findUniqueOrThrow({
    where: { id: profile.id },
    include: { checklistItems: { where: { country }, orderBy: { createdAt: "asc" } } },
  });
}

/**
 * The jurisdiction-specific switches a module declares, resolved against the
 * user's stored answers. Defaults come from the module so a profile that has
 * never been configured still estimates on the right branch rather than an
 * undefined one.
 */
function resolvedInputs(profile: { country: TaxCountry; residencyStatus: string | null; region: string | null; ageBand: string | null }) {
  const rules = getTaxRules(profile.country);
  const answers: Record<string, string> = {
    ...(profile.residencyStatus ? { residencyStatus: profile.residencyStatus } : {}),
    ...(profile.region ? { region: profile.region } : {}),
    ...(profile.ageBand ? { ageBand: profile.ageBand } : {}),
  };
  for (const spec of rules.inputs ?? []) {
    if (answers[spec.key] === undefined && spec.defaultValue !== undefined) answers[spec.key] = spec.defaultValue;
  }
  return answers;
}

async function calculate(ownerClerkId: string) {
  const profile = await ensureTaxProfile(ownerClerkId);
  const rules = getTaxRules(profile.country);
  // Each module owns its own period, because not every tax year is the calendar
  // year — South Africa's runs 1 March to the end of February.
  const period = rules.periodFor(profile.taxYear);
  const transactions = await prisma.transaction.findMany({
    where: { ownerClerkId, occurredAt: { gte: period.start, lt: period.end } },
    select: { type: true, amount: true, currency: true, isTaxable: true, source: true, assetSymbol: true, incomeSource: true },
  });
  const taxableWalletAssets = new Set(["USDC", "CNGN", "ETH"]);
  const taxCurrency = rules.currency;
  const normalizedTransactions = await Promise.all(transactions.map(async (item) => {
    let amount = Number(item.amount);
    try { amount = await convertCurrencyAmount(amount, item.currency ?? "USD", taxCurrency); } catch { /* Preserve the stored amount if no rate is available. */ }
    return {
      type: item.type,
      amount,
      isTaxable: item.isTaxable || (item.source === "wallet" && Boolean(item.assetSymbol) && taxableWalletAssets.has(item.assetSymbol!.toUpperCase())),
      incomeSource: item.incomeSource,
    };
  }));
  const result = rules.calculate({
    taxYear: profile.taxYear,
    transactions: normalizedTransactions,
    deductions: (profile.deductionsCaptured as Record<string, unknown> | null) ?? {},
    inputs: resolvedInputs(profile),
    now: new Date(),
  });
  await prisma.taxProfile.update({ where: { id: profile.id }, data: { estimatedTaxOwed: new Prisma.Decimal(result.estimatedTaxOwed), taxableIncome: new Prisma.Decimal(result.taxableIncome), lastCalculatedAt: new Date() } });
  return { profile, result, rules };
}

taxRouter.get("/profile", async (req, res) => {
  res.json({ data: await ensureTaxProfile(req.auth!.userId) });
});

/**
 * The module's own metadata, so the client renders its deduction and input form
 * from the same descriptors the calculator reads. Generating the form from the
 * module is what stops the two from drifting apart as countries are added.
 */
taxRouter.get("/rules", async (req, res) => {
  const profile = await ensureTaxProfile(req.auth!.userId);
  const rules = getTaxRules(profile.country);
  res.json({
    data: {
      country: profile.country,
      currency: rules.currency,
      taxYear: profile.taxYear,
      taxYearLabel: rules.periodFor(profile.taxYear).label,
      inputs: rules.inputs ?? [],
      deductions: rules.deductions ?? [],
      credits: rules.credits ?? [],
      answers: resolvedInputs(profile),
      deductionsCaptured: profile.deductionsCaptured ?? {},
    },
  });
});

taxRouter.patch("/profile", async (req, res) => {
  const input = z.object({
    country: countrySchema.optional(),
    deductions: deductionsSchema.optional(),
    residencyStatus: z.string().trim().max(32).nullable().optional(),
    region: z.string().trim().max(32).nullable().optional(),
    ageBand: z.string().trim().max(32).nullable().optional(),
  }).parse(req.body);
  const existing = await ensureTaxProfile(req.auth!.userId);
  const country = input.country ?? existing.country;
  await prisma.taxProfile.update({
    where: { id: existing.id },
    data: {
      country,
      ...(input.deductions ? { deductionsCaptured: input.deductions as Prisma.InputJsonValue } : {}),
      ...(input.residencyStatus !== undefined ? { residencyStatus: input.residencyStatus } : {}),
      ...(input.region !== undefined ? { region: input.region } : {}),
      ...(input.ageBand !== undefined ? { ageBand: input.ageBand } : {}),
    },
  });
  // Checklist seeding and pruning both live in ensureTaxProfile, so there is one
  // path that can keep a country's list correct rather than two that can drift.
  res.json({ data: await ensureTaxProfile(req.auth!.userId) });
});

taxRouter.get("/estimate", async (req, res) => {
  const { result } = await calculate(req.auth!.userId);
  res.json({ data: result });
});

/**
 * Label income in bulk. Classifying one row at a time is how a tax engine ends up
 * with no classified income at all, and unlabelled income silently escapes
 * self-employment tax and National Insurance. Passing no transactionIds labels
 * every unlabelled income row in the tax year, which is the common case for a
 * user adopting this after the fact.
 */
taxRouter.patch("/income-source", async (req, res) => {
  const input = z.object({
    incomeSource: z.nativeEnum(IncomeSource).nullable(),
    transactionIds: z.array(z.string().min(1)).max(500).optional(),
  }).parse(req.body);
  const profile = await ensureTaxProfile(req.auth!.userId);
  const period = getTaxRules(profile.country).periodFor(profile.taxYear);
  const where: Prisma.TransactionWhereInput = {
    ownerClerkId: req.auth!.userId,
    type: "INCOME",
    occurredAt: { gte: period.start, lt: period.end },
    ...(input.transactionIds ? { id: { in: input.transactionIds } } : { incomeSource: null }),
  };
  const updated = await prisma.transaction.updateMany({ where, data: { incomeSource: input.incomeSource } });
  res.json({ data: { updated: updated.count, incomeSource: input.incomeSource } });
});

taxRouter.get("/summary", async (req, res) => {
  const { profile, result } = await calculate(req.auth!.userId);
  const summary = await generateGatewaySummary(`Summarize this informational tax estimate for the user in 3 short bullet points. Country: ${result.country}. Currency: ${result.currency}. Tax period: ${result.taxYearLabel}. Taxable income: ${result.taxableIncome}. Estimated tax owed: ${result.estimatedTaxOwed}. Components: ${JSON.stringify(result.components)}. Deductions captured: ${JSON.stringify(profile.deductionsCaptured ?? {})}. Mention that the result is an estimate and should be verified with a qualified tax professional.`);
  res.json({ data: { ...result, summary } });
});

taxRouter.get("/checklist", async (req, res) => {
  const profile = await ensureTaxProfile(req.auth!.userId);
  res.json({ data: { country: profile.country, taxYear: profile.taxYear, items: profile.checklistItems } });
});

taxRouter.patch("/checklist/:key", async (req, res) => {
  const status = z.nativeEnum(TaxChecklistStatus).parse(req.body.status);
  const profile = await ensureTaxProfile(req.auth!.userId);
  const item = await prisma.taxChecklistItem.updateMany({ where: { taxProfileId: profile.id, country: profile.country, key: req.params.key }, data: { status } });
  if (!item.count) { res.status(404).json({ error: { code: "CHECKLIST_ITEM_NOT_FOUND", message: "Tax checklist item was not found." } }); return; }
  res.json({ data: await prisma.taxChecklistItem.findFirst({ where: { taxProfileId: profile.id, country: profile.country, key: req.params.key } }) });
});
