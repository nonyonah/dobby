import type { TaxRuleModule } from "./types.js";
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
function progressiveTax(income: number) {
  const bands = [{ limit: 800_000, rate: 0 }, { limit: 3_000_000, rate: .15 }, { limit: 12_000_000, rate: .18 }, { limit: 25_000_000, rate: .21 }, { limit: 50_000_000, rate: .23 }, { limit: Infinity, rate: .25 }];
  let tax = 0; let lower = 0;
  for (const band of bands) { tax += Math.max(0, Math.min(income, band.limit) - lower) * band.rate; lower = band.limit; if (income <= band.limit) break; }
  return tax;
}
export const nigeriaRules: TaxRuleModule = {
  country: "NIGERIA",
  checklist: [{ key: "income_records", label: "Income records (salary, freelance, or rental)" }, { key: "rent_receipt", label: "Rent payment receipt for relief" }, { key: "pension_nhf_statements", label: "Pension and NHF contribution statements" }, { key: "tin", label: "Tax Identification Number (TIN)" }],
  calculate({ taxYear, transactions, deductions }) {
    const grossIncome = transactions.filter((item) => item.type === "INCOME").reduce((sum, item) => sum + item.amount, 0);
    const taxableReceipts = transactions.filter((item) => item.type === "INCOME" && item.isTaxable).reduce((sum, item) => sum + item.amount, 0);
    const rentRelief = Math.min(number(deductions.rentPaid) * .2, 500_000); const pension = number(deductions.pensionContributions); const nhf = number(deductions.nhfContributions); const total = rentRelief + pension + nhf;
    const taxableIncome = Math.max(0, taxableReceipts - total);
    return { country: "NIGERIA", taxYear, grossIncome, taxableIncome, deductions: { rentRelief, pension, nhf, total }, estimatedTaxOwed: progressiveTax(taxableIncome), annualFiling: true, filingDeadline: `${taxYear + 1}-03-31`, notes: ["Informational estimate only; confirm applicable rules with a Nigerian tax professional.", "Nigeria has no quarterly estimated-payment requirement in this module."] };
  },
};
