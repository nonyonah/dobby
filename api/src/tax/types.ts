import type { TaxCountry } from "@prisma/client";

export type TaxTransaction = { type: "INCOME" | "EXPENSE" | "TRANSFER"; amount: number; isTaxable: boolean };
export type TaxDeductions = Record<string, unknown>;
export type TaxCalculation = {
  country: TaxCountry; taxYear: number; grossIncome: number; taxableIncome: number; deductions: Record<string, number>;
  estimatedTaxOwed: number; annualFiling: boolean; filingDeadline: string;
  quarterly?: { required: boolean; threshold: number; currentPayment: number; nextPayment: number; nextDueDate: string | null };
  notes: string[];
};
export type TaxRuleModule = {
  country: TaxCountry; checklist: Array<{ key: string; label: string }>;
  calculate(input: { taxYear: number; transactions: TaxTransaction[]; deductions: TaxDeductions; now: Date }): TaxCalculation;
};
