import { calendarPeriod, DISCLAIMER, num, progressiveTax, quarterlySchedule } from "./shared.js";
import type { Band } from "./shared.js";
import type { TaxRuleModule } from "./types.js";

/**
 * Income tax and National Insurance, England / Wales / Northern Ireland,
 * 2026/27 (6 April 2026 – 5 April 2027).
 */
const PERSONAL_ALLOWANCE = 12_570;
/** The allowance tapers £1 for every £2 of income above this, reaching nil at £125,140. */
const TAPER_THRESHOLD = 100_000;
const ALLOWANCE_FULLY_TAPERED = 125_140;
const ALLOWANCE_TAPER_RATE = 0.5;

const BANDS: Band[] = [
  { limit: 50_270, rate: 0.2 },
  { limit: 125_140, rate: 0.4 },
  { limit: Infinity, rate: 0.45 },
];

/** Class 1 (employment) and Class 4 (self-employment) share these thresholds. */
const PRIMARY_THRESHOLD = 1_255;
const UPPER_EARNINGS_LIMIT = 967 * 52;
const EMPLOYEE_NI_RATE = 0.08;
const EMPLOYER_NI_RATE = 0.015;
/** Above the UEL the employee share drops to 2%; the employer rate still applies to all of it. */
const UPPER_EARNINGS_RATE = 0.02;

/** Scotland uses its own bands; we warn rather than silently mis-estimating. */
const SCOTTISH_BANDS: Band[] = [
  { limit: 28_711, rate: 0.18 },
  { limit: 70_784, rate: 0.2 },
  { limit: 135_793, rate: 0.21 },
  { limit: Infinity, rate: 0.45 },
];

/** Self Assessment payment on account is only demanded above this amount. */
const PAYMENT_ON_ACCOUNT_THRESHOLD = 1_000;

function personalAllowance(income: number): number {
  const reduction = Math.max(0, income - TAPER_THRESHOLD) * ALLOWANCE_TAPER_RATE;
  return Math.max(0, PERSONAL_ALLOWANCE - reduction);
}

/**
 * The taper is not a separate band: losing £1 of allowance costs £1 of income,
 * so the marginal rate on the tapered slice is the basic rate plus the taper.
 */
function incomeTax(chargeableIncome: number, bands: Band[]): number {
  return progressiveTax(chargeableIncome, bands);
}

/**
 * Class 1 (employment) and Class 4 (self-employment) share these thresholds, so
 * the split between them is the only thing that decides which liability applies.
 */
function niFor(earnings: number) {
  const aboveThreshold = Math.max(0, earnings - PRIMARY_THRESHOLD);
  const atPrimaryRate = Math.min(aboveThreshold, UPPER_EARNINGS_LIMIT - PRIMARY_THRESHOLD);
  const aboveUpperLimit = Math.max(0, earnings - UPPER_EARNINGS_LIMIT);
  return {
    employee: atPrimaryRate * EMPLOYEE_NI_RATE + aboveUpperLimit * UPPER_EARNINGS_RATE,
    employer: aboveThreshold * EMPLOYER_NI_RATE,
  };
}

export const ukRules: TaxRuleModule = {
  country: "UK",
  currency: "GBP",
  periodFor: calendarPeriod,
  inputs: [
    {
      key: "region",
      label: "Region of England, Wales or Northern Ireland",
      hint: "Scotland has different income tax bands and is not estimated here.",
      kind: "select",
      defaultValue: "england-wales-ni",
      options: [
        { value: "england-wales-ni", label: "England, Wales or Northern Ireland" },
        { value: "scotland", label: "Scotland" },
      ],
    },
  ],
  deductions: [
    { key: "pensionContributions", label: "Pension contributions paid net of tax", hint: "A net-pay arrangement reduces your pay before tax. A relief-at-source arrangement does not appear here." },
    { key: "donations", label: "Charitable donations made through Gift Aid" },
    { key: "allowableExpenses", label: "Allowable business expenses" },
    { key: "rentARoom", label: "Rental income covered by Rent-a-room", hint: "Lettings relief exempts up to £7,500 of property income." },
  ],
  checklist: [
    { key: "self_assessment_registration", label: "Registered for Self Assessment if not on PAYE" },
    { key: "income_source_labels", label: "Income labelled as employment or self-employment (it decides Class 1 vs Class 4 NI)" },
    { key: "expense_records", label: "Expense records, kept for 6 years from the end of the tax year" },
    { key: "pension_relief", label: "Pension relief confirmed with your provider" },
    { key: "allowances", label: "Checked for Marriage Allowance and Rent-a-room eligibility" },
    { key: "return_deadline", label: "Return filed by 31 October (paper) or 31 January (online)" },
    { key: "balancing_payment", label: "Balancing payment made by 31 July" },
    { key: "payment_on_account", label: "Payments on account made by 31 January and 31 July" },
  ],
  calculate({ taxYear, transactions, deductions, inputs, now }) {
    const income = transactions.filter((item) => item.type === "INCOME");
    const grossIncome = income.reduce((sum, item) => sum + item.amount, 0);

    const employmentIncome = income
      .filter((item) => item.incomeSource === "EMPLOYMENT")
      .reduce((sum, item) => sum + item.amount, 0);
    const selfEmploymentIncome = income
      .filter((item) => item.incomeSource === "SELF_EMPLOYMENT")
      .reduce((sum, item) => sum + item.amount, 0);
    const otherIncome = income
      .filter((item) => item.incomeSource == null || item.incomeSource === "INVESTMENT" || item.incomeSource === "RENTAL" || item.incomeSource === "OTHER")
      .reduce((sum, item) => sum + item.amount, 0);

    const isScotland = inputs.region === "scotland";
    const allowance = isScotland ? 0 : personalAllowance(grossIncome);
    const bands = isScotland ? SCOTTISH_BANDS : BANDS;

    const pension = num(deductions.pensionContributions);
    const donations = num(deductions.donations);
    const allowableExpenses = num(deductions.allowableExpenses);
    const rentARoom = Math.min(num(deductions.rentARoom), 7_500);

    const totalDeductions = pension + donations + allowableExpenses + rentARoom;
    const chargeableIncome = Math.max(0, grossIncome - allowance - totalDeductions);
    const personalIncomeTax = incomeTax(chargeableIncome, bands);

    // Class 1 applies to earnings; Class 4 to self-employment profits. Both use
    // the same thresholds, so the split is the only thing that differs.
    const classOne = niFor(employmentIncome);
    const classFour = niFor(Math.max(0, selfEmploymentIncome - allowableExpenses));
    const nationalInsurance = classOne.employee + classFour.employee;
    const employerNi = classOne.employer;

    const total = personalIncomeTax + nationalInsurance;
    const scottishWarning = isScotland;

    const notes = [
      DISCLAIMER,
      "Class 1 National Insurance assumes an employer is deducting it from your pay. Self Assessment also collects balancing payments, which are not modelled here.",
      "The personal allowance taper is applied as a £1 reduction in allowance per £2 of income above £100,000, so it costs 50p of tax per extra pound earned.",
    ];
    if (scottishWarning) {
      notes.push("You selected Scotland, which uses its own bands. This estimate uses those bands, but Scottish income tax is set separately from the rest of the UK.");
    }
    if (otherIncome > 0 && employmentIncome === 0 && selfEmploymentIncome === 0) {
      notes.push("No income is labelled employment or self-employment, so no National Insurance was estimated. Label your income for a more accurate estimate.");
    }

    return {
      country: "UK",
      currency: "GBP",
      taxYear,
      taxYearLabel: `6 April ${taxYear} – 5 April ${taxYear + 1}`,
      grossIncome,
      taxableIncome: chargeableIncome,
      deductions: {
        personalAllowance: allowance,
        pension,
        donations,
        allowableExpenses,
        rentARoom,
        total: allowance + totalDeductions,
      },
      credits: { total: 0 },
      components: [
        { key: "incomeTax", label: "Income tax", amount: personalIncomeTax },
        { key: "nationalInsurance", label: "National Insurance (Class 1 + Class 4)", amount: nationalInsurance },
        { key: "employerNi", label: "Employer National Insurance (Class 1, not deducted from you)", amount: employerNi },
      ],
      estimatedTaxOwed: total,
      annualFiling: true,
      filingDeadline: `${taxYear + 1}-01-31`,
      quarterly: quarterlySchedule(total, PAYMENT_ON_ACCOUNT_THRESHOLD, now, [
        `${taxYear + 1}-01-31`,
        `${taxYear + 1}-07-31`,
      ]),
      notes,
    };
  },
};
