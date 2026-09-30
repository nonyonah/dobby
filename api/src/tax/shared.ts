import type { TaxPeriod } from "./types.js";

/** Coerce anything a client can send into a non-negative finite number. */
export const num = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;

export const int = (value: unknown, fallback: number): number => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export type Band = { /** Inclusive upper bound of this band. */ limit: number; rate: number };

/**
 * Progressive marginal tax over cumulative band widths. `bands` are given as
 * ascending cumulative limits (e.g. Nigeria's 800k, 3m, 12m, 25m, 50m, Inf)
 * so each row's width is the difference from the row above it — the same shape
 * the statutes publish.
 */
export function progressiveTax(income: number, bands: Band[]): number {
  let tax = 0;
  let lower = 0;
  for (const band of bands) {
    tax += Math.max(0, Math.min(income, band.limit) - lower) * band.rate;
    if (income <= band.limit) break;
    lower = band.limit;
  }
  return tax;
}

/** The default tax period: the calendar year. */
export function calendarPeriod(taxYear: number): TaxPeriod {
  return {
    start: new Date(Date.UTC(taxYear, 0, 1)),
    end: new Date(Date.UTC(taxYear + 1, 0, 1)),
    label: `1 January ${taxYear} – 31 December ${taxYear}`,
  };
}

const iso = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Estimated-payment schedule shared by the countries that use one. `dates` are
 * the due dates in order; the next one due is the first still in the future.
 */
export function quarterlySchedule(
  estimatedTax: number,
  threshold: number,
  now: Date,
  dates: string[],
): NonNullable<import("./types.js").TaxCalculation["quarterly"]> {
  const required = estimatedTax >= threshold;
  const next = dates.find((date) => new Date(`${date}T23:59:59Z`) >= now) ?? null;
  const payment = required ? estimatedTax / dates.length : 0;
  return { required, threshold, currentPayment: payment, nextPayment: payment, nextDueDate: required ? next : null };
}

/** ISO date `months` months after `from`, clamped to the end of the target month. */
export function addMonths(from: Date, months: number): Date {
  const target = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(from.getUTCDate(), lastDay));
  return target;
}

export { iso };

/** Standard disclaimer appended to every module so no screen reads as advice. */
export const DISCLAIMER =
  "Informational estimate only. Confirm the result and your filing position with a qualified tax professional before you rely on it.";
