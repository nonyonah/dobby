import { DISCLAIMER, num, progressiveTax } from "./shared.js";
import type { Band } from "./shared.js";
import type { TaxCalculation, TaxPeriod, TaxRuleModule } from "./types.js";

/**
 * Year of assessment 2027 (1 March 2026 – 28 February 2027). SARS numbers a year
 * of assessment by the calendar year in which it ends, so taxYear 2027 is this
 * period — which is why `periodFor` does not return the calendar year.
 */
const BANDS: Band[] = [
  { limit: 245_100, rate: 0.18 },
  { limit: 383_100, rate: 0.26 },
  { limit: 530_200, rate: 0.31 },
  { limit: 695_800, rate: 0.36 },
  { limit: 887_000, rate: 0.39 },
  { limit: 1_878_600, rate: 0.41 },
  { limit: Infinity, rate: 0.45 },
];

const PRIMARY_REBATE = 17_820;
const SECONDARY_REBATE = 9_765;
const TERTIARY_REBATE = 3_249;

/** Medical scheme fees tax credit, per month. */
const MEDICAL_MAIN = 376;
const MEDICAL_ADDITIONAL = 254;

const RETIREMENT_ABSOLUTE_CAP = 430_000;
const RETIREMENT_PERCENTAGE = 0.275;

type AgeBand = "under65" | "65to74" | "75plus";

function resolveAgeBand(value: string | undefined): AgeBand {
  if (value === "65to74" || value === "75plus") return value;
  return "under65";
}

/**
 * 1 March of `taxYear - 1` through the end of February of `taxYear`, which is
 * what SARS calls year of assessment `taxYear`.
 */
function yearOfAssessment(taxYear: number): TaxPeriod {
  return {
    start: new Date(Date.UTC(taxYear - 1, 2, 1)),
    end: new Date(Date.UTC(taxYear, 2, 1)),
    label: `1 March ${taxYear - 1} – ${taxYear % 4 === 0 ? 29 : 28} February ${taxYear}`,
  };
}

export const southAfricaRules: TaxRuleModule = {
  country: "SOUTH_AFRICA",
  currency: "ZAR",
  periodFor: yearOfAssessment,
  inputs: [
    {
      key: "ageBand",
      label: "Your age band",
      hint: "SARS pays additional rebates and raises the tax threshold from age 65, and again from 75.",
      kind: "select",
      defaultValue: "under65",
      options: [
        { value: "under65", label: "Under 65" },
        { value: "65to74", label: "65 to 74" },
        { value: "75plus", label: "75 or older" },
      ],
    },
    {
      key: "additionalDependants",
      label: "Additional medical scheme dependants",
      hint: "Each dependant beyond the first adds a monthly medical scheme fees tax credit.",
      kind: "count",
      defaultValue: "0",
    },
    {
      key: "provisionalTaxpayer",
      label: "Are you a provisional taxpayer?",
      hint: "Required if you earn non-remuneration income, or remuneration from an unregistered employer.",
      kind: "select",
      defaultValue: "unknown",
      options: [
        { value: "unknown", label: "Not sure" },
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    },
  ],
  deductions: [
    { key: "retirementContributions", label: "Retirement fund contributions", hint: "Deductible up to 27.5% of the greater of your remuneration or taxable income, capped at R430,000." },
    { key: "donationsPbo", label: "Donations to approved public benefit organisations", hint: "Deductible up to 10% of taxable income." },
    { key: "medicalExpenses", label: "Qualifying medical expenses above the medical scheme credit", requiresEvidence: true },
    { key: "travelAllowance", label: "Travel allowance and related logbook amounts" },
  ],
  checklist: [
    { key: "sars_registration", label: "SARS eFiling profile and tax reference number" },
    { key: "provisional_status", label: "Provisional tax status determined and IRP6 filed if you are a provisional taxpayer" },
    { key: "medical_credit", label: "Medical scheme contributions claimed, with proof of payment" },
    { key: "retirement_deduction", label: "Retirement fund contributions deducted within the 27.5% / R430,000 cap" },
    { key: "donations", label: "Section 18A donation receipts collected" },
    { key: "capital_gains", label: "Capital disposals checked against the R50,000 annual exclusion" },
    { key: "provisional_payments", label: "Provisional tax paid by the end of September and end of March" },
  ],
  calculate({ taxYear, transactions, deductions, inputs }): TaxCalculation {
    const grossIncome = transactions.filter((item) => item.type === "INCOME").reduce((sum, item) => sum + item.amount, 0);
    const taxableExpenses = transactions.filter((item) => item.type === "EXPENSE" && item.isTaxable).reduce((sum, item) => sum + item.amount, 0);
    const ageBand = resolveAgeBand(inputs.ageBand);
    const additionalDependants = Math.max(0, Number.parseInt(inputs.additionalDependants ?? "0", 10) || 0);

    const personal = inputs.provisionalTaxpayer === "no" ? 0 : num(deductions.personalExpenses);

    const taxableIncome = Math.max(0, grossIncome - taxableExpenses - personal);

    // Retirement is capped at the lower of R430,000 and 27.5% of the greater of
    // remuneration or taxable income.
    const retirementRequested = num(deductions.retirementContributions);
    const retirementCap = Math.min(RETIREMENT_ABSOLUTE_CAP, RETIREMENT_PERCENTAGE * Math.max(grossIncome, taxableIncome));
    const retirement = Math.min(retirementRequested, retirementCap);

    const donations = num(deductions.donationsPbo);
    const medicalExpenses = num(deductions.medicalExpenses);
    const travelAllowance = num(deductions.travelAllowance);

    // Section 18A donations are deductible up to 10% of taxable income; anything
    // above that limit carries forward rather than being lost.
    const donationsLimit = 0.1 * taxableIncome;
    const donationsAllowed = Math.min(donations, donationsLimit);

    const taxableAfterDeductions = Math.max(0, taxableIncome - retirement - donationsAllowed - medicalExpenses - travelAllowance);
    const grossTax = progressiveTax(taxableAfterDeductions, BANDS);

    // Rebates and medical scheme credits are credits against tax payable, not
    // reductions of income, so they are applied after the brackets.
    const primary = PRIMARY_REBATE;
    const secondary = ageBand === "under65" ? 0 : SECONDARY_REBATE;
    const tertiary = ageBand === "75plus" ? TERTIARY_REBATE : 0;
    const medicalSchemeCredit = 12 * (2 * MEDICAL_MAIN + additionalDependants * MEDICAL_ADDITIONAL);
    const creditTotal = primary + secondary + tertiary + medicalSchemeCredit;

    const taxAfterCredits = Math.max(0, grossTax - creditTotal);
    const donationsCarriedForward = donations - donationsAllowed;

    const notes = [
      DISCLAIMER,
      "Rebates and medical scheme tax credits are applied after the brackets, which is why they are shown separately from income tax.",
      "Capital gains are not modelled. A taxable capital gain is included at 40% with a R50,000 annual exclusion, so a disposal in this period is not reflected.",
      `Medical scheme fees credit is based on ${2 + additionalDependants} ${2 + additionalDependants === 1 ? "person" : "people"} covered. Only the taxpayer and first dependant get the full R376 monthly credit.`,
    ];
    if (ageBand === "under65") {
      notes.push("You are under 65, so the secondary and tertiary rebates do not apply.");
    }
    if (donationsCarriedForward > 0.5) {
      notes.push(`${Math.round(donationsCarriedForward)} of your donations exceed the 10% limit and would be carried forward rather than deducted this year.`);
    }
    if (inputs.provisionalTaxpayer === "yes") {
      notes.push("As a provisional taxpayer you file an IRP6 and pay provisional tax, rather than waiting for the annual return.");
    }

    const period = yearOfAssessment(taxYear);

    return {
      country: "SOUTH_AFRICA",
      currency: "ZAR",
      taxYear,
      taxYearLabel: period.label,
      grossIncome,
      taxableIncome,
      deductions: {
        taxableExpenses,
        personal,
        retirement,
        retirementCap,
        donations: donationsAllowed,
        donationsCarriedForward,
        medicalExpenses,
        travelAllowance,
        total: taxableExpenses + personal + retirement + donationsAllowed + medicalExpenses + travelAllowance,
      },
      credits: {
        primaryRebate: primary,
        secondaryRebate: secondary,
        tertiaryRebate: tertiary,
        medicalSchemeCredit,
        total: creditTotal,
      },
      components: [
        { key: "incomeTax", label: "Income tax after rebates and credits", amount: taxAfterCredits },
      ],
      estimatedTaxOwed: taxAfterCredits,
      annualFiling: inputs.provisionalTaxpayer !== "yes",
      filingDeadline: `${taxYear}-09-30`,
      notes,
    };
  },
};
