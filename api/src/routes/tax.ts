import { IncomeSource, Prisma, TaxChecklistStatus, TaxCountry, TransactionType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { assertPro } from "../middleware/plan.js";
import { prisma } from "../lib/prisma.js";
import { utcTimestamp } from "../lib/sql.js";
import { runExclusive } from "../lib/user-mutex.js";
import { requireAuth } from "../middleware/auth.js";
import { getTaxRules, taxCountryForJurisdiction } from "../tax/registry.js";
import { generateGatewaySummary } from "../providers/ai-gateway.js";
import { getConversionFactors } from "../providers/frankfurter.js";

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

async function loadTaxProfile(ownerClerkId: string, country: TaxCountry) {
  return prisma.taxProfile.findUnique({
    where: { ownerClerkId },
    include: { checklistItems: { where: { country }, orderBy: { createdAt: "asc" } } },
  });
}

async function seedChecklist(taxProfileId: string, country: TaxCountry) {
  const rules = getTaxRules(country);
  const keys = rules.checklist.map((item) => item.key);
  await prisma.taxChecklistItem.createMany({
    data: rules.checklist.map((item) => ({ taxProfileId, country, key: item.key, label: item.label })),
    skipDuplicates: true,
  });
  await prisma.taxChecklistItem.deleteMany({
    where: { taxProfileId, country, key: { notIn: keys } },
  });
}

/**
 * Ensure the TaxProfile exists and its checklist matches the jurisdiction.
 * Concurrent GETs for the same user are serialized so createMany/deleteMany
 * cannot race. Read-only paths skip write work when the profile is already
 * seeded for the current country.
 */
async function ensureTaxProfile(ownerClerkId: string, options: { forceSeed?: boolean } = {}) {
  return runExclusive(`tax-profile:${ownerClerkId}`, async () => {
    const country = await taxCountryFor(ownerClerkId);
    let profile = await loadTaxProfile(ownerClerkId, country);

    if (!profile) {
      await prisma.taxProfile.upsert({
        where: { ownerClerkId },
        create: { ownerClerkId, country, taxYear: currentYear() },
        update: { country },
      });
      profile = await loadTaxProfile(ownerClerkId, country);
    } else if (profile.country !== country) {
      await prisma.taxProfile.update({ where: { id: profile.id }, data: { country } });
      profile = await loadTaxProfile(ownerClerkId, country);
    }

    if (!profile) {
      throw new Error("Tax profile missing after ensure");
    }

    const expectedKeys = getTaxRules(country).checklist.map((item) => item.key);
    const existingKeys = new Set(profile.checklistItems.map((item) => item.key));
    const needsSeed =
      options.forceSeed ||
      expectedKeys.length !== existingKeys.size ||
      expectedKeys.some((key) => !existingKeys.has(key));

    if (needsSeed) {
      await seedChecklist(profile.id, country);
      profile = await loadTaxProfile(ownerClerkId, country);
    }

    if (!profile) {
      throw new Error("Tax profile missing after seed");
    }
    return profile;
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

/**
 * One row per (type, currency, taxable, source, asset, incomeSource) group for
 * the period, summing the amounts in the database.
 *
 * The tax modules only ever *sum* a transaction's type, amount, taxable flag and
 * income source — they never need an individual row — so the grouping is
 * loss-free. Postgres sums the exact decimals, so the only difference from
 * loading every row is that a year of history arrives as a few dozen groups
 * rather than a few thousand objects.
 */
type TaxAggRow = {
  type: string;
  currency: string;
  is_taxable: boolean;
  source: string | null;
  asset_symbol: string | null;
  income_source: string | null;
  total: Prisma.Decimal;
};

async function calculate(ownerClerkId: string) {
  const profile = await ensureTaxProfile(ownerClerkId);
  const rules = getTaxRules(profile.country);
  // Each module owns its own period, because not every tax year is the calendar
  // year — South Africa's runs 1 March to the end of February.
  const period = rules.periodFor(profile.taxYear);
  const groups = await prisma.$queryRaw<TaxAggRow[]>`
    SELECT
      t.type::text AS type,
      t.currency,
      t."isTaxable" AS is_taxable,
      t.source,
      t."assetSymbol" AS asset_symbol,
      t."incomeSource"::text AS income_source,
      SUM(t.amount) AS total
    FROM "Transaction" t
    WHERE t."ownerClerkId" = ${ownerClerkId}
      AND t."occurredAt" >= ${utcTimestamp(period.start)}
      AND t."occurredAt" < ${utcTimestamp(period.end)}
    GROUP BY 1, 2, 3, 4, 5, 6
  `;
  const taxableWalletAssets = new Set(["USDC", "CNGN", "ETH"]);
  const taxCurrency = rules.currency;
  const factors = await getConversionFactors(
    groups.map((group) => group.currency ?? "USD"),
    taxCurrency,
  );
  const normalizedTransactions = groups.map((group) => {
    const amount = Number(group.total) * (factors.get((group.currency ?? "USD").toUpperCase()) ?? 1);
    return {
      type: group.type as TransactionType,
      amount,
      isTaxable:
        group.is_taxable ||
        (group.source === "wallet" &&
          Boolean(group.asset_symbol) &&
          taxableWalletAssets.has(group.asset_symbol!.toUpperCase())),
      incomeSource: group.income_source as IncomeSource | null,
    };
  });
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
  await assertPro(req.auth?.userId, "Tax profile");
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
  res.json({ data: await ensureTaxProfile(req.auth!.userId, { forceSeed: true }) });
});

taxRouter.get("/estimate", async (req, res) => {
  await assertPro(req.auth?.userId, "Tax estimates");
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
  await assertPro(req.auth?.userId, "Tax income sources");
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
  await assertPro(req.auth?.userId, "Tax summary");
  const { profile, result } = await calculate(req.auth!.userId);
  const summary = await generateGatewaySummary(`Summarize this informational tax estimate for the user in 3 short bullet points. Country: ${result.country}. Currency: ${result.currency}. Tax period: ${result.taxYearLabel}. Taxable income: ${result.taxableIncome}. Estimated tax owed: ${result.estimatedTaxOwed}. Components: ${JSON.stringify(result.components)}. Deductions captured: ${JSON.stringify(profile.deductionsCaptured ?? {})}. Mention that the result is an estimate and should be verified with a qualified tax professional.`);
  res.json({ data: { ...result, summary } });
});

taxRouter.get("/checklist", async (req, res) => {
  await assertPro(req.auth?.userId, "Tax checklist");
  const profile = await ensureTaxProfile(req.auth!.userId);
  res.json({ data: { country: profile.country, taxYear: profile.taxYear, items: profile.checklistItems } });
});

taxRouter.patch("/checklist/:key", async (req, res) => {
  await assertPro(req.auth?.userId, "Tax checklist");
  const key = z.string().trim().min(1).max(80).parse(req.params.key);
  const status = z.nativeEnum(TaxChecklistStatus).parse(req.body.status);
  const profile = await ensureTaxProfile(req.auth!.userId);
  const item = await prisma.taxChecklistItem.updateMany({ where: { taxProfileId: profile.id, country: profile.country, key }, data: { status } });
  if (!item.count) { res.status(404).json({ error: { code: "CHECKLIST_ITEM_NOT_FOUND", message: "Tax checklist item was not found." } }); return; }
  res.json({ data: await prisma.taxChecklistItem.findFirst({ where: { taxProfileId: profile.id, country: profile.country, key } }) });
});
