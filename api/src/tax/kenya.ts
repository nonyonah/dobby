import { calendarPeriod, DISCLAIMER, num, progressiveTax } from "./shared.js";
import type { Band } from "./shared.js";
import type { TaxCalculation, TaxRuleModule } from "./types.js";

/**
 * Kenyan PAYE for resident individuals, in force since 1 July 2023. The annual
 * equivalents are used here so a partial year of transactions cannot distort the
 * monthly band widths the KRA table is published in.
 */
const RESIDENT_BANDS: Band[] = [
  { limit: 288_000, rate: 0.1 },
  { limit: 388_000, rate: 0.25 },
  { limit: 6_000_000, rate: 0.3 },
  { limit: 9_600_000, rate: 0.325 },
  { limit: Infinity, rate: 0.35 },
];

/** Non-residents are taxed on a separate, much flatter schedule. */
const NON_RESIDENT_BANDS: Band[] = [
  { limit: Infinity, rate: 0.15 },
];
const NON_RESIDENT_BUSINESS_RATE = 0.3;

const PERSONAL_RELIEF = 28_800;
const INSURANCE_RELIEF_CAP = 60_000;
const INSURANCE_RELIEF_RATE = 0.15;

/** Employers pay instalment tax on individual employees above this monthly salary. */
const INSTALMENT_THRESHOLD_MONTHLY = 100_000;

/** Relief is 15% of premiums and stops growing at KSh 60,000, so premiums beyond 4x that add nothing. */
const INSURANCE_RELIEF_EFFECTIVE_PREMIUM_CAP = INSURANCE_RELIEF_CAP / INSURANCE_RELIEF_RATE;

export const kenyaRules: TaxRuleModule = {
  country: "KENYA",
  currency: "KES",
  periodFor: calendarPeriod,
  inputs: [
    {
      key: "residencyStatus",
      label: "Tax residency",
      hint: "Non-residents are taxed on a separate, much flatter schedule. Getting this wrong changes the answer substantially.",
      kind: "select",
      defaultValue: "resident",
      options: [
        { value: "resident", label: "Resident" },
        { value: "non-resident", label: "Non-resident" },
      ],
    },
  ],
  deductions: [
    { key: "insurancePremiums", label: "Insurance premiums", hint: "15% relief on premiums, capped at KSh 60,000 a year. Premiums above KSh 400,000 add no further relief.", cap: { amount: INSURANCE_RELIEF_EFFECTIVE_PREMIUM_CAP, note: "Relief stops growing at KSh 400,000 of premiums (15% capped at KSh 60,000)." } },
    { key: "housingCosts", label: "Rent paid on your own occupied home" },
    { key: "postRetirementMedical", label: "Post-retirement medical fund contributions", hint: "15% relief, capped at KSh 60,000 a year." },
    { key: "medicalExpenses", label: "Qualifying medical expenses", requiresEvidence: true },
  ],
  checklist: [
    { key: "aura_registration", label: "AURA account active and your TIN verified (AURA replaced PINs)" },
    { key: "kyc", label: "KYC complete on iTax" },
    { key: "residency_confirmed", label: "Residency status confirmed — non-residents are taxed differently" },
    { key: "relief_evidence", label: "Insurance and medical premium receipts kept for relief" },
    { key: "instalment_tax", label: "Instalment tax deducted if your monthly salary exceeds KSh 100,000" },
    { key: "return_filed", label: "Individual return filed and balance paid by the due date" },
  ],
  calculate({ taxYear, transactions, deductions, inputs }): TaxCalculation {
    const income = transactions.filter((item) => item.type === "INCOME");
    const grossIncome = income.reduce((sum, item) => sum + item.amount, 0);
    const isResident = inputs.residencyStatus !== "non-resident";

    const taxableReceipts = income.filter((item) => item.isTaxable).reduce((sum, item) => sum + item.amount, 0);

    if (isResident) {
      const insuranceRelief = Math.min(num(deductions.insurancePremiums) * INSURANCE_RELIEF_RATE, INSURANCE_RELIEF_CAP);
      const housingRelief = num(deductions.housingCosts);
      const medicalRelief = num(deductions.postRetirementMedical) * INSURANCE_RELIEF_RATE;
      const medicalExpenses = num(deductions.medicalExpenses);

      // Personal relief and the capped reliefs reduce the base; the cap applies
      // to relief claimed in excess of personal relief, per the KRA ordering.
      const reliefAbovePersonal = insuranceRelief + housingRelief + medicalRelief;
      const appliedRelief = Math.min(reliefAbovePersonal, Math.max(0, taxableReceipts - PERSONAL_RELIEF));

      const taxableIncome = Math.max(0, taxableReceipts - PERSONAL_RELIEF - appliedRelief);
      const grossTax = progressiveTax(taxableIncome, RESIDENT_BANDS);
      const taxAfterPersonalRelief = Math.max(0, grossTax - Math.min(PERSONAL_RELIEF, grossTax));

      const instalmentTax = income.some((item) => item.incomeSource === "EMPLOYMENT" && item.amount / 12 > INSTALMENT_THRESHOLD_MONTHLY)
        ? 0.1 * grossIncome
        : 0;

      const total = taxAfterPersonalRelief + instalmentTax;

      return {
        country: "KENYA",
        currency: "KES",
        taxYear,
        taxYearLabel: `1 January ${taxYear} – 31 December ${taxYear}`,
        grossIncome,
        taxableIncome,
        deductions: {
          personalRelief: Math.min(PERSONAL_RELIEF, taxableReceipts),
          insuranceRelief,
          housingRelief,
          postRetirementMedical: medicalRelief,
          medicalExpenses,
          total: Math.min(PERSONAL_RELIEF, taxableReceipts) + appliedRelief + medicalExpenses,
        },
        credits: { total: 0 },
        components: [
          { key: "paye", label: "PAYE income tax", amount: taxAfterPersonalRelief },
          { key: "instalmentTax", label: "Instalment tax (deducted from employment income)", amount: instalmentTax },
        ],
        estimatedTaxOwed: total,
        annualFiling: true,
        filingDeadline: `${taxYear + 1}-04-30`,
        notes: [
          DISCLAIMER,
          "Instalment tax is deducted from your pay by your employer, so including it here double-counts it against take-home pay.",
          "Medical and housing relief caps should be confirmed against the current Income Tax Act before relying on this figure.",
        ],
      };
    }

    const employmentIncome = income.filter((item) => item.incomeSource === "EMPLOYMENT").reduce((sum, item) => sum + item.amount, 0);
    const businessIncome = income.filter((item) => item.incomeSource === "SELF_EMPLOYMENT").reduce((sum, item) => sum + item.amount, 0);
    const otherTaxable = Math.max(0, taxableReceipts - employmentIncome - businessIncome);

    const employmentTax = progressiveTax(employmentIncome, NON_RESIDENT_BANDS);
    const businessTax = businessIncome >= 100_000 * 12 ? businessIncome * NON_RESIDENT_BUSINESS_RATE : 0;
    const otherTax = otherTaxable * 0.15;
    const total = employmentTax + businessTax + otherTax;

    return {
      country: "KENYA",
      currency: "KES",
      taxYear,
      taxYearLabel: `1 January ${taxYear} – 31 December ${taxYear}`,
      grossIncome,
      taxableIncome: taxableReceipts,
      deductions: { total: 0 },
      credits: { total: 0 },
      components: [
        { key: "employmentTax", label: "Non-resident tax on employment income (15%)", amount: employmentTax },
        { key: "businessTax", label: "Non-resident tax on business income (30%)", amount: businessTax },
        { key: "otherTax", label: "Non-resident tax on other income (15%)", amount: otherTax },
      ],
      estimatedTaxOwed: total,
      annualFiling: true,
      filingDeadline: `${taxYear + 1}-06-30`,
      notes: [
        DISCLAIMER,
        "Non-residents are taxed on a separate flat-rate schedule with no personal relief, so their liability is often higher than a resident's on the same income.",
      ],
    };
  },
};

export const KENYA_LATE_FILING_PENALTY = { rate: 0.05, floor: 2_000 };
