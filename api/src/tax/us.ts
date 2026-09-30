import { calendarPeriod, DISCLAIMER, num, progressiveTax, quarterlySchedule } from "./shared.js";
import type { Band } from "./shared.js";
import type { TaxRuleModule } from "./types.js";

type FilingStatus = "single" | "married-joint" | "married-separate" | "head-of-household";

type YearFigures = {
  brackets: Record<FilingStatus, Band[]>;
  standardDeduction: Record<FilingStatus, number>;
  /** Social Security taxable maximum. */
  socialSecurityWageBase: number;
  /** Thresholds for the 0.9% Additional Medicare Tax and the 3.8% NIIT. */
  additionalMedicareThreshold: Record<FilingStatus, number>;
  netInvestmentIncomeThreshold: Record<FilingStatus, number>;
};

/**
 * Inflation-adjusted figures for a tax year. Keyed by year so a stale tax year
 * is a visible fallback rather than a silently wrong answer — `figuresFor`
 * reports whether it matched exactly and the module says so in a note.
 */
const FIGURES_BY_YEAR: Record<number, YearFigures> = {
  2026: {
    brackets: {
      single: [
        { limit: 12_400, rate: 0.1 },
        { limit: 50_400, rate: 0.12 },
        { limit: 105_700, rate: 0.22 },
        { limit: 201_775, rate: 0.24 },
        { limit: 256_225, rate: 0.32 },
        { limit: 640_600, rate: 0.35 },
        { limit: Infinity, rate: 0.37 },
      ],
      "married-joint": [
        { limit: 24_800, rate: 0.1 },
        { limit: 100_800, rate: 0.12 },
        { limit: 211_400, rate: 0.22 },
        { limit: 403_550, rate: 0.24 },
        { limit: 512_450, rate: 0.32 },
        { limit: 768_700, rate: 0.35 },
        { limit: Infinity, rate: 0.37 },
      ],
      "married-separate": [
        { limit: 12_400, rate: 0.1 },
        { limit: 50_400, rate: 0.12 },
        { limit: 105_700, rate: 0.22 },
        { limit: 201_775, rate: 0.24 },
        { limit: 256_225, rate: 0.32 },
        { limit: 640_600, rate: 0.35 },
        { limit: Infinity, rate: 0.37 },
      ],
      "head-of-household": [
        { limit: 17_700, rate: 0.1 },
        { limit: 67_450, rate: 0.12 },
        { limit: 105_700, rate: 0.22 },
        { limit: 201_775, rate: 0.24 },
        { limit: 256_200, rate: 0.32 },
        { limit: 640_600, rate: 0.35 },
        { limit: Infinity, rate: 0.37 },
      ],
    },
    standardDeduction: {
      single: 16_100,
      "married-joint": 32_200,
      "married-separate": 16_100,
      "head-of-household": 24_150,
    },
    socialSecurityWageBase: 184_500,
    additionalMedicareThreshold: {
      single: 200_000,
      "married-joint": 250_000,
      "married-separate": 125_000,
      "head-of-household": 200_000,
    },
    netInvestmentIncomeThreshold: {
      single: 200_000,
      "married-joint": 250_000,
      "married-separate": 125_000,
      "head-of-household": 200_000,
    },
  },
};

const LATEST_YEAR = Math.max(...Object.keys(FIGURES_BY_YEAR).map(Number));

function figuresFor(taxYear: number): { figures: YearFigures; exact: boolean } {
  const exact = FIGURES_BY_YEAR[taxYear];
  if (exact) return { figures: exact, exact: true };
  // Nearest configured year to the one being estimated, so an unmigrated tax
  // year degrades to the closest real figures instead of failing or inventing.
  const nearest = Object.keys(FIGURES_BY_YEAR)
    .map(Number)
    .sort((a, b) => Math.abs(a - taxYear) - Math.abs(b - taxYear))[0]!;
  return { figures: FIGURES_BY_YEAR[nearest]!, exact: false };
}

const SOCIAL_SECURITY_RATE = 0.124;
const MEDICARE_RATE = 0.029;
const ADDITIONAL_MEDICARE_RATE = 0.009;
const NIIT_RATE = 0.038;
/** Net earnings from self-employment below this are not subject to SE tax. */
const SE_TAX_FLOOR = 400;

const FILING_STATUSES: FilingStatus[] = ["single", "married-joint", "married-separate", "head-of-household"];

function resolveStatus(value: string | undefined): FilingStatus {
  const match = FILING_STATUSES.find((status) => status === value);
  return match ?? "single";
}

export const usRules: TaxRuleModule = {
  country: "US",
  currency: "USD",
  periodFor: calendarPeriod,
  inputs: [
    {
      key: "filingStatus",
      label: "Filing status",
      kind: "select",
      defaultValue: "single",
      options: [
        { value: "single", label: "Single" },
        { value: "married-joint", label: "Married filing jointly" },
        { value: "married-separate", label: "Married filing separately" },
        { value: "head-of-household", label: "Head of household" },
      ],
    },
  ],
  deductions: [
    { key: "retirementContributions", label: "Retirement contributions you can deduct yourself", hint: "SEP-IRA, Solo 401(k) or a traditional IRA. Regular 401(k) contributions are already excluded from your wages and must not be entered here." },
    { key: "selfEmploymentHealthInsurance", label: "Self-employed health insurance premiums" },
    { key: "qualifiedOvertime", label: "Qualified overtime compensation", hint: "Deductible up to $12,500 ($25,000 if married filing jointly) for tax years ending before 2029." },
    { key: "studentLoanInterest", label: "Student loan interest" },
  ],
  checklist: [
    { key: "income_sources", label: "Every income transaction labelled employment, self-employment, or investment" },
    { key: "1099_forms", label: "All 1099-NEC and 1099-K forms received" },
    { key: "w4_withholding", label: "W-4 withholding confirmed against your expected liability" },
    { key: "expense_records", label: "Categorized expense records" },
    { key: "estimated_payments", label: "Prior estimated payment records" },
    { key: "home_office_area", label: "Home office square footage if claiming that deduction" },
  ],
  calculate({ taxYear, transactions, deductions, inputs, now }) {
    const { figures, exact } = figuresFor(taxYear);
    const status = resolveStatus(inputs.filingStatus);

    const income = transactions.filter((item) => item.type === "INCOME");
    const grossIncome = income.reduce((sum, item) => sum + item.amount, 0);

    // Self-employment tax is only ever due on self-employment income. Treating
    // W-2 wages as self-employment was the single biggest error here.
    const bySource = (source: string) =>
      income.filter((item) => (item.incomeSource ?? "OTHER") === source).reduce((sum, item) => sum + item.amount, 0);
    const employmentIncome = bySource("EMPLOYMENT");
    const selfEmploymentIncome = bySource("SELF_EMPLOYMENT");
    const investmentIncome = bySource("INVESTMENT") + bySource("RENTAL");
    const otherIncome = bySource("OTHER");
    const unclassifiedIncome = income.filter((item) => item.incomeSource == null).reduce((sum, item) => sum + item.amount, 0);

    // Expenses are allocated against income in the order the law allows: they
    // reduce business income first, then rental, then investment, and only then
    // wages. With no expense-level classification the best available assumption
    // is that expenses belong to the self-employment they funded.
    const taxableExpenses = transactions.filter((item) => item.type === "EXPENSE" && item.isTaxable).reduce((sum, item) => sum + item.amount, 0);
    let remainingExpenses = taxableExpenses;
    const offset = (target: number) => {
      const used = Math.min(target, remainingExpenses);
      remainingExpenses -= used;
      return target - used;
    };
    const netSelfEmployment = offset(selfEmploymentIncome);
    const netInvestment = offset(investmentIncome);
    const netEmployment = offset(employmentIncome);
    const netOther = offset(otherIncome);

    const retirement = num(deductions.retirementContributions);
    const healthInsurance = num(deductions.selfEmploymentHealthInsurance);
    const overtime = num(deductions.qualifiedOvertime);
    const studentLoanInterest = num(deductions.studentLoanInterest);

    // Net earnings from self-employment, before the deductible employer share.
    const netEarnings = Math.max(0, netSelfEmployment - healthInsurance - overtime - studentLoanInterest);
    const seApplies = netEarnings >= SE_TAX_FLOOR;

    // Employment wages consume the Social Security wage base before net
    // earnings get any of it, which is why a freelancer with a day job owes less
    // SE tax than the headline 15.3% suggests.
    const socialSecurityRoom = Math.max(0, figures.socialSecurityWageBase - netEmployment);
    const socialSecurityPortion = seApplies ? Math.min(netEarnings, socialSecurityRoom) * SOCIAL_SECURITY_RATE : 0;
    const medicarePortion = seApplies ? netEarnings * MEDICARE_RATE : 0;
    const selfEmploymentTax = socialSecurityPortion + medicarePortion;
    const halfSelfEmploymentTax = selfEmploymentTax / 2;

    const aboveTheLineDeductions = retirement + healthInsurance + overtime + studentLoanInterest + halfSelfEmploymentTax;
    const adjustedGrossIncome = Math.max(
      0,
      netEmployment + netSelfEmployment + netInvestment + netOther - aboveTheLineDeductions,
    );

    const standardDeduction = figures.standardDeduction[status];
    const taxableIncome = Math.max(0, adjustedGrossIncome - standardDeduction);
    const incomeTax = progressiveTax(taxableIncome, figures.brackets[status]);

    const medicareWages = netEmployment + (seApplies ? netEarnings : 0);
    const additionalMedicareTax =
      ADDITIONAL_MEDICARE_RATE * Math.max(0, medicareWages - figures.additionalMedicareThreshold[status]);
    const netInvestmentIncomeTax =
      NIIT_RATE * Math.min(netInvestment, Math.max(0, adjustedGrossIncome - figures.netInvestmentIncomeThreshold[status]));

    const totalTax = incomeTax + selfEmploymentTax + additionalMedicareTax + netInvestmentIncomeTax;

    const notes = [
      DISCLAIMER,
      `Figures are the inflation-adjusted ${LATEST_YEAR} amounts${exact ? "" : `; you are viewing ${taxYear}, for which they have not been updated yet`}.`,
      "Assumes the standard deduction. Itemising may reduce your tax.",
      "Deducible expenses are assumed to reduce self-employment income first, then rental, then investment income, then wages.",
      "Capital gains, the qualified business income deduction, and child tax credits are not modelled, so high-income estimates are likely high.",
    ];
    if (unclassifiedIncome > 0) {
      notes.push(
        `${Math.round(unclassifiedIncome)} of your income is not labelled with a source, so no self-employment tax was applied to it. Label it in your transactions for a more accurate estimate.`,
      );
    }

    return {
      country: "US",
      currency: "USD",
      taxYear,
      taxYearLabel: `1 January ${taxYear} – 31 December ${taxYear}`,
      grossIncome,
      taxableIncome,
      deductions: {
        taxableExpenses,
        selfEmploymentHealthInsurance: healthInsurance,
        qualifiedOvertime: overtime,
        studentLoanInterest,
        retirement,
        halfSelfEmploymentTax,
        standardDeduction,
        total: taxableExpenses + healthInsurance + overtime + studentLoanInterest + retirement + halfSelfEmploymentTax + standardDeduction,
      },
      credits: { total: 0 },
      components: [
        { key: "incomeTax", label: "Federal income tax", amount: incomeTax },
        { key: "selfEmploymentTax", label: "Self-employment tax (Social Security + Medicare)", amount: selfEmploymentTax },
        { key: "additionalMedicareTax", label: "Additional Medicare Tax", amount: additionalMedicareTax },
        { key: "netInvestmentIncomeTax", label: "Net Investment Income Tax", amount: netInvestmentIncomeTax },
      ],
      estimatedTaxOwed: totalTax,
      annualFiling: true,
      filingDeadline: `${taxYear + 1}-04-15`,
      quarterly: quarterlySchedule(totalTax, 1_000, now, [
        `${taxYear}-04-15`,
        `${taxYear}-06-15`,
        `${taxYear}-09-15`,
        `${taxYear + 1}-01-15`,
      ]),
      notes,
    };
  },
};
