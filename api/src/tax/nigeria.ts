import { calendarPeriod, DISCLAIMER, num, progressiveTax } from "./shared.js";
import type { TaxRuleModule } from "./types.js";

/**
 * Nigeria Tax Act 2025, Fourth Schedule (in force 1 Jan 2026). The Act also
 * merged capital gains into the personal income tax rates, so gains are now
 * taxed at these progressive rates rather than the old flat 10% CGT.
 */
const BANDS = [
  { limit: 800_000, rate: 0 },
  { limit: 3_000_000, rate: 0.15 },
  { limit: 12_000_000, rate: 0.18 },
  { limit: 25_000_000, rate: 0.21 },
  { limit: 50_000_000, rate: 0.23 },
  { limit: Infinity, rate: 0.25 },
];

/** s.30(2): rent relief is 20% of annual rent, subject to a ₦500,000 maximum. */
const RENT_RELIEF_CAP = 500_000;

export const nigeriaRules: TaxRuleModule = {
  country: "NIGERIA",
  currency: "NGN",
  periodFor: calendarPeriod,
  // s.30(2) eligible deductions. Every one carries requiresEvidence because
  // s.31 disallows a deduction that is not claimed in writing and s.32 requires
  // proof — without the paperwork the amount simply is not deductible.
  deductions: [
    {
      key: "rentPaid",
      label: "Annual rent paid",
      hint: "20% relief is applied to this, capped at ₦500,000. Keep your rent receipts and a declaration of the amount actually paid.",
      cap: { amount: RENT_RELIEF_CAP, note: "Relief is 20% of rent paid, capped at ₦500,000 (s.30(2)(vi))." },
      requiresEvidence: true,
    },
    { key: "pensionContributions", label: "Pension contributions", hint: "Contributions under the Pension Reform Act.", requiresEvidence: true },
    { key: "nhfContributions", label: "National Housing Fund contributions", requiresEvidence: true },
    { key: "nhisContributions", label: "National Health Insurance Scheme contributions", requiresEvidence: true },
    { key: "housingLoanInterest", label: "Interest on a loan for an owner-occupied home", requiresEvidence: true },
    { key: "lifeAssurance", label: "Life assurance or deferred annuity premiums", hint: "Premiums on a policy on your own life or your spouse's.", requiresEvidence: true },
  ],
  checklist: [
    { key: "income_records", label: "Income records (salary, freelance, or rental)" },
    { key: "written_claims", label: "Written claim of every deduction, with supporting documents (s.31/32)" },
    { key: "rent_receipt", label: "Rent payment receipts and declared rent for relief" },
    { key: "pension_nhf_statements", label: "Pension, NHF and NHIS contribution statements" },
    { key: "tin", label: "Tax Identification Number (TIN)" },
  ],
  calculate({ taxYear, transactions, deductions }) {
    const grossIncome = transactions.filter((item) => item.type === "INCOME").reduce((sum, item) => sum + item.amount, 0);
    const taxableReceipts = transactions.filter((item) => item.type === "INCOME" && item.isTaxable).reduce((sum, item) => sum + item.amount, 0);

    const rentRelief = Math.min(num(deductions.rentPaid) * 0.2, RENT_RELIEF_CAP);
    const pension = num(deductions.pensionContributions);
    const nhf = num(deductions.nhfContributions);
    const nhis = num(deductions.nhisContributions);
    const housingLoanInterest = num(deductions.housingLoanInterest);
    const lifeAssurance = num(deductions.lifeAssurance);
    const total = rentRelief + pension + nhf + nhis + housingLoanInterest + lifeAssurance;

    const taxableIncome = Math.max(0, taxableReceipts - total);
    const incomeTax = progressiveTax(taxableIncome, BANDS);

    return {
      country: "NIGERIA",
      currency: "NGN",
      taxYear,
      taxYearLabel: `1 January ${taxYear} – 31 December ${taxYear}`,
      grossIncome,
      taxableIncome,
      deductions: { rentRelief, pension, nhf, nhis, housingLoanInterest, lifeAssurance, total },
      credits: { total: 0 },
      components: [{ key: "incomeTax", label: "Personal income tax", amount: incomeTax }],
      estimatedTaxOwed: incomeTax,
      annualFiling: true,
      filingDeadline: `${taxYear + 1}-03-31`,
      notes: [
        DISCLAIMER,
        "Deductions are only allowed if claimed in writing with proof of the claim (s.31 and s.32). Entering an amount here does not make it deductible on its own.",
        "Capital gains are taxed at these income tax rates; the former flat 10% capital gains tax no longer applies under the Nigeria Tax Act 2025.",
        "Filing deadlines are set by your State Internal Revenue Service and are not uniform nationwide.",
        "Nigeria has no quarterly estimated-payment requirement in this module.",
      ],
    };
  },
};
