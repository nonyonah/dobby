import type { IncomeSource, TaxCountry } from "@prisma/client";

/**
 * `incomeSource` is what lets a country choose between liabilities that differ by
 * *source* rather than by amount — UK Class 1 (employment) vs Class 4
 * (self-employment) National Insurance, or US self-employment tax, which has no
 * business being applied to W-2 wages. It is null on historical rows, which the
 * calculators treat as unclassified rather than guessing.
 */
export type TaxTransaction = {
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  amount: number;
  isTaxable: boolean;
  incomeSource?: IncomeSource | null;
};

export type TaxDeductions = Record<string, unknown>;

/** Free-form jurisdiction switches (residency, region, age band) chosen from `TaxInputSpec`. */
export type TaxInputs = Record<string, string>;

export type TaxPeriod = {
  start: Date;
  /** Exclusive upper bound, matching the transaction range query. */
  end: Date;
  /** Human label, e.g. "1 March 2026 – 28 February 2027". */
  label: string;
};

export type TaxDeductionSpec = {
  key: string;
  label: string;
  hint?: string;
  /** Fixed statutory cap, described in the user's own currency. */
  cap?: { amount: number; note: string };
  /**
   * Nigeria s.31/32: a deduction is not allowed at all unless it is claimed in
   * writing with supporting documents, so the UI must ask for the paperwork
   * rather than letting the number silently disappear into the total.
   */
  requiresEvidence?: boolean;
};

export type TaxCreditSpec = {
  key: string;
  label: string;
  hint?: string;
};

export type TaxInputOption = { value: string; label: string };

export type TaxInputSpec = {
  key: string;
  label: string;
  hint?: string;
  kind: "select" | "number" | "count";
  options?: TaxInputOption[];
  defaultValue?: string;
  /** Reveal this input only once the named inputs hold these values. */
  showWhen?: Record<string, string>;
};

export type TaxComponent = { key: string; label: string; amount: number };

export type TaxCalculation = {
  country: TaxCountry;
  currency: string;
  taxYear: number;
  taxYearLabel: string;
  grossIncome: number;
  taxableIncome: number;
  /** Flat record of every deduction applied, including `total`. */
  deductions: Record<string, number>;
  /** Flat record of every credit applied, including `total`. */
  credits: Record<string, number>;
  /** Named liabilities (income tax, National Insurance, self-employment tax…). */
  components: TaxComponent[];
  estimatedTaxOwed: number;
  annualFiling: boolean;
  filingDeadline: string;
  quarterly?: { required: boolean; threshold: number; currentPayment: number; nextPayment: number; nextDueDate: string | null };
  notes: string[];
};

export type TaxRuleModule = {
  country: TaxCountry;
  /** Currency the module's rules are expressed in. Transactions are converted to it. */
  currency: string;
  checklist: Array<{ key: string; label: string }>;
  /** Which twelve months this tax year covers. Defaults to the calendar year. */
  periodFor(taxYear: number): TaxPeriod;
  inputs?: TaxInputSpec[];
  deductions?: TaxDeductionSpec[];
  credits?: TaxCreditSpec[];
  calculate(input: { taxYear: number; transactions: TaxTransaction[]; deductions: TaxDeductions; inputs: TaxInputs; now: Date }): TaxCalculation;
};
