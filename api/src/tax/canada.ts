import { calendarPeriod, DISCLAIMER, num, progressiveTax, quarterlySchedule } from "./shared.js";
import type { Band } from "./shared.js";
import type { TaxRuleModule } from "./types.js";

/**
 * Canadian FEDERAL income tax only, 2026.
 *
 * Provincial and territorial income tax is additional to these rates and is not
 * included. That is a deliberate scope decision, not an oversight: ten provinces
 * and three territories each publish their own brackets and credits, and an
 * estimator that guessed at them would be wrong in a way the user could not see.
 * The result is labelled as federal-only everywhere it surfaces.
 */
const BANDS: Band[] = [
  { limit: 58_523, rate: 0.14 },
  { limit: 117_045, rate: 0.205 },
  { limit: 181_440, rate: 0.26 },
  { limit: 258_482, rate: 0.29 },
  { limit: Infinity, rate: 0.33 },
];

/** Basic personal amount and the enhanced CPP employee/employer shares. */
const BASIC_PERSONAL_AMOUNT = 17_373;
const CPP_EMPLOYEE_SHARE = 0.059;
const CPP_SELF_EMPLOYED_SHARE = 0.059;
const CPP_ENHANCED_EMPLOYEE_SHARE = 0.004;
const YMPE = 71_300;

/** Federal instalments are only required above this much tax for the year. */
const INSTALMENT_THRESHOLD = 3_000;

export const canadaRules: TaxRuleModule = {
  country: "CANADA",
  currency: "CAD",
  periodFor: calendarPeriod,
  inputs: [
    {
      key: "age65",
      label: "Are you 65 or older?",
      hint: "Ages 65+ contribute an extra 0.4% to CPP and can draw from your RRSP at a lower rate.",
      kind: "select",
      defaultValue: "no",
      options: [
        { value: "no", label: "No" },
        { value: "yes", label: "Yes" },
      ],
    },
  ],
  deductions: [
    { key: "rrspContributions", label: "RRSP contributions", hint: "Needs your prior-year Notice of Assessment. The contribution deadline is 60 days after the end of the year." },
    { key: "cppContributions", label: "CPP contributions you make yourself", hint: "Self-employed people pay both the employee and employer shares, plus the enhanced share at 65+." },
    { key: "professionalDues", label: "Professional and union dues" },
    { key: "movingCosts", label: "Eligible moving costs" },
    { key: "childCareExpenses", label: "Child care expenses" },
  ],
  checklist: [
    { key: "province_confirmed", label: "Province or territory confirmed — provincial tax is separate from this federal estimate" },
    { key: "notice_of_assessment", label: "Prior-year Notice of Assessment, to know your RRSP contribution room" },
    { key: "rrsp_contributed", label: "RRSP contributed within 60 days of the end of the year" },
    { key: "cpp_contributed", label: "CPP contributions made, including both shares if self-employed" },
    { key: "gst_credit", label: "Applied for the GST/HST credit if eligible" },
    { key: "instalments", label: "Federal instalments paid on the 15th of April, June, September and December if required" },
    { key: "balance_paid", label: "Return filed and any balance paid by 30 April" },
  ],
  calculate({ taxYear, transactions, deductions, inputs, now }) {
    const income = transactions.filter((item) => item.type === "INCOME");
    const grossIncome = income.reduce((sum, item) => sum + item.amount, 0);
    const taxableReceipts = income.filter((item) => item.isTaxable).reduce((sum, item) => sum + item.amount, 0);
    const taxableExpenses = transactions.filter((item) => item.type === "EXPENSE" && item.isTaxable).reduce((sum, item) => sum + item.amount, 0);

    const rrsp = num(deductions.rrspContributions);
    const cppUserPaid = num(deductions.cppContributions);
    const professionalDues = num(deductions.professionalDues);
    const movingCosts = num(deductions.movingCosts);
    const childCare = num(deductions.childCareExpenses);

    const totalDeductions = rrsp + cppUserPaid + professionalDues + movingCosts + childCare;
    const taxableIncome = Math.max(0, taxableReceipts - totalDeductions);
    const grossFederalTax = progressiveTax(taxableIncome, BANDS);

    // The basic personal amount is a non-refundable credit, and it tapers to zero
    // across a band near the top of the rates.
    const creditPhaseoutStart = 133_281;
    const creditPhaseoutEnd = 177_881;
    const credit = Math.max(0, BASIC_PERSONAL_AMOUNT * (1 - Math.max(0, taxableIncome - creditPhaseoutStart) / (creditPhaseoutEnd - creditPhaseoutStart)));
    const federalIncomeTax = Math.max(0, grossFederalTax - credit);

    // CPP is a separate contribution, not income tax. Both the employee and the
    // self-employed shares are capped at the year's maximum pensionable earnings.
    const employeeShare = Math.min(taxableReceipts, YMPE) * CPP_EMPLOYEE_SHARE;
    const enhancedShare = inputs.age65 === "yes" ? Math.min(taxableReceipts, YMPE) * CPP_ENHANCED_EMPLOYEE_SHARE : 0;
    const selfEmployedShare = inputs.age65 === "yes"
      ? Math.min(taxableReceipts, YMPE) * (CPP_EMPLOYEE_SHARE + CPP_SELF_EMPLOYED_SHARE + CPP_ENHANCED_EMPLOYEE_SHARE)
      : Math.min(taxableReceipts, YMPE) * (CPP_EMPLOYEE_SHARE + CPP_SELF_EMPLOYED_SHARE);
    const cppPayableByEmployer = Math.min(employeeShare + enhancedShare, selfEmployedShare);
    const cppPayableByUser = Math.min(Math.max(0, selfEmployedShare - employeeShare - enhancedShare) + cppUserPaid, selfEmployedShare);

    const total = federalIncomeTax + cppPayableByEmployer + cppPayableByUser;

    return {
      country: "CANADA",
      currency: "CAD",
      taxYear,
      taxYearLabel: `1 January ${taxYear} – 31 December ${taxYear}`,
      grossIncome,
      taxableIncome,
      deductions: {
        rrsp,
        cppContributions: cppUserPaid,
        professionalDues,
        movingCosts,
        childCare,
        total: totalDeductions,
      },
      credits: { basicPersonalAmount: credit, total: credit },
      components: [
        { key: "federalIncomeTax", label: "Federal income tax", amount: federalIncomeTax },
        { key: "cpp", label: "Canada Pension Plan contributions", amount: cppPayableByEmployer + cppPayableByUser },
      ],
      estimatedTaxOwed: total,
      annualFiling: true,
      filingDeadline: `${taxYear + 1}-04-30`,
      quarterly: quarterlySchedule(total, INSTALMENT_THRESHOLD, now, [
        `${taxYear}-04-15`,
        `${taxYear}-06-15`,
        `${taxYear}-09-15`,
        `${taxYear}-12-15`,
      ]),
      notes: [
        DISCLAIMER,
        "This is FEDERAL tax only. Provincial and territorial income tax is additional and is not included here, so your actual liability is higher. Yukon and the Northwest Territories have no provincial income tax.",
        "2026 figures; rates and the basic personal amount are indexed each year.",
        `The basic personal amount credit phases out to zero between ${creditPhaseoutStart.toLocaleString("en-CA")} and ${creditPhaseoutEnd.toLocaleString("en-CA")} of taxable income.`,
      ],
    };
  },
};
