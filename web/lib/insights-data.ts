export interface Range {
  start: number; // month index 0..11
  end: number; // inclusive
}

export const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export interface MonthPoint {
  income: number;
  expenses: number;
}

export const YEAR: MonthPoint[] = [
  { income: 34100, expenses: 19800 },
  { income: 36500, expenses: 20400 },
  { income: 38200, expenses: 21400 },
  { income: 41500, expenses: 20800 },
  { income: 39800, expenses: 22100 },
  { income: 44200, expenses: 19900 },
  { income: 46100, expenses: 20600 },
  { income: 47300, expenses: 18900 },
  { income: 48290, expenses: 18340 },
  { income: 0, expenses: 0 },
  { income: 0, expenses: 0 },
  { income: 0, expenses: 0 },
];

function seedRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface CategorySeries {
  id: string;
  name: string;
  emoji: string;
  dot: string;
  monthly: number[];
}

const CAT_BASE: { id: string; share: number }[] = [
  { id: "housing", share: 0.31 },
  { id: "groceries", share: 0.09 },
  { id: "transport", share: 0.05 },
  { id: "dining", share: 0.04 },
  { id: "shopping", share: 0.07 },
  { id: "investments", share: 0.12 },
  { id: "date", share: 0.03 },
  { id: "education", share: 0.04 },
  { id: "utilities", share: 0.03 },
  { id: "other", share: 0.05 },
];

const CAT_META: Record<string, { name: string; emoji: string; dot: string }> = {
  housing: { name: "Housing", emoji: "🏠", dot: "#a855f7" },
  groceries: { name: "Groceries", emoji: "🛒", dot: "#ad7f22" },
  transport: { name: "Transport", emoji: "🚕", dot: "#4a55c9" },
  dining: { name: "Dining", emoji: "🍽", dot: "#b0402f" },
  shopping: { name: "Shopping", emoji: "🛍", dot: "#7c3aed" },
  investments: { name: "Investments", emoji: "📈", dot: "#0d9488" },
  date: { name: "Date", emoji: "💌", dot: "#e11d48" },
  education: { name: "Education", emoji: "📚", dot: "#3a44a8" },
  utilities: { name: "Utilities", emoji: "💡", dot: "#35754e" },
  other: { name: "Other", emoji: "📦", dot: "#8a8b91" },
};

export const CATEGORY_SERIES: CategorySeries[] = CAT_BASE.map((c, ci) => {
  const rand = seedRand(1000 + ci * 77);
  return {
    id: c.id,
    ...CAT_META[c.id],
    monthly: YEAR.map((m) => Math.round(m.expenses * c.share * (0.7 + rand() * 0.6))),
  };
});

export interface SourceSeries {
  id: string;
  name: string;
  monthly: number[];
}

const SRC_BASE = [
  { id: "salary", name: "Acme salary", share: 0.46 },
  { id: "northwind", name: "Northwind", share: 0.24 },
  { id: "freelance", name: "Freelance", share: 0.19 },
  { id: "adhoc", name: "Ad-hoc projects", share: 0.11 },
];

export const SOURCE_SERIES: SourceSeries[] = SRC_BASE.map((s, si) => {
  const rand = seedRand(5000 + si * 131);
  return {
    ...s,
    monthly: YEAR.map((m) => Math.round(m.income * s.share * (0.6 + rand() * 0.8))),
  };
});

export interface Account {
  id: string;
  label: string;
  kind: "account" | "wallet";
  balance: number;
}

export const ACCOUNTS: Account[] = [
  { id: "a1", label: "Mercury ··4821", kind: "account", balance: 12400 },
  { id: "a2", label: "Chase ··3567", kind: "account", balance: 8900 },
  { id: "a3", label: "Amex ··1005", kind: "account", balance: -1240 },
  { id: "w1", label: "Main wallet", kind: "wallet", balance: 4210 },
  { id: "w2", label: "Savings wallet", kind: "wallet", balance: 1050 },
];

export interface DeductionFull {
  id: string;
  name: string;
  detail: string;
  captured: number;
  cap: number;
}

export const DEDUCTIONS_FULL: DeductionFull[] = [
  { id: "rent", name: "Rent relief", detail: "20% of rent, capped", captured: 1200, cap: 1200 },
  { id: "pension", name: "Pension (8%)", detail: "Employer + voluntary", captured: 3860, cap: 3860 },
  { id: "nhf", name: "NHF (2.5%)", detail: "National Housing Fund", captured: 0, cap: 1150 },
];

/** Running tax estimate through the year (8% of cumulative taxable inflow). */
export const TAX_TREND: { label: string; value: number }[] = (() => {
  let acc = 0;
  return MONTH_LABELS.map((label, i) => {
    acc += Math.round(YEAR[i].income * 0.08 * (0.7 + ((i * 37) % 10) / 25));
    return { label, value: acc };
  });
})();

export function sumMonths(values: number[], r: Range): number {
  let s = 0;
  for (let i = Math.max(0, r.start); i <= Math.min(11, r.end); i++) s += values[i] ?? 0;
  return s;
}

/** Equal-length period immediately before the range; null when out of data. */
export function priorRange(r: Range): Range | null {
  const len = r.end - r.start + 1;
  const end = r.start - 1;
  if (end < 0) return null;
  return { start: Math.max(0, end - len + 1), end };
}

export function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export function rangeLabel(r: Range): string {
  if (r.start === r.end) return MONTH_LABELS[r.start];
  return `${MONTH_LABELS[r.start]}–${MONTH_LABELS[r.end]}`;
}

// ——— Day-granular ranges (scrubber paints days, figures prorate months) ———

export interface DayRange {
  from: Date;
  to: Date;
}

export const DATA_START = new Date(2026, 0, 1);
export const DATA_END = new Date(2026, 8, 30); // Sep 30, last day with data

const DAY_MS = 86400000;

export function dayIndex(d: Date): number {
  return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - DATA_START.getTime()) / DAY_MS);
}

export function dateAtDay(n: number): Date {
  return new Date(2026, 0, 1 + Math.max(0, n));
}

function daysInMonth(m: number): number {
  return new Date(2026, m + 1, 0).getDate();
}

/** Fraction of month m covered by [from, to]. */
export function monthOverlap(m: number, from: Date, to: Date): number {
  const start = new Date(2026, m, 1).getTime();
  const end = new Date(2026, m, daysInMonth(m), 23, 59, 59).getTime();
  const overlap = Math.min(end, to.getTime()) - Math.max(start, from.getTime());
  if (overlap <= 0) return 0;
  return Math.min(1, overlap / (end - start));
}

export function sumDays(values: number[], from: Date, to: Date): number {
  let s = 0;
  for (let m = 0; m < 12; m++) s += (values[m] ?? 0) * monthOverlap(m, from, to);
  return s;
}

export function monthsIn(from: Date, to: Date): number[] {
  const out: number[] = [];
  for (let m = 0; m < 12; m++) if (monthOverlap(m, from, to) > 0) out.push(m);
  return out;
}

export function balanceAtDay(base: number, values: MonthPoint[], to: Date): number {
  let b = base;
  for (let m = 0; m < 12; m++) {
    b += ((values[m]?.income ?? 0) - (values[m]?.expenses ?? 0)) * monthOverlap(m, DATA_START, to);
  }
  return Math.round(b);
}

/** Equal-length period immediately before `from`; null at the data edge. */
export function priorDayRange(from: Date, to: Date): DayRange | null {
  const len = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
  const pto = new Date(from.getTime() - DAY_MS);
  const pfrom = new Date(pto.getTime() - (len - 1) * DAY_MS);
  if (pto.getTime() < DATA_START.getTime()) return null;
  return { from: pfrom < DATA_START ? DATA_START : pfrom, to: pto };
}

const MONTH_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function dayRangeLabel(from: Date, to: Date): string {
  const sameDay = from.toDateString() === to.toDateString();
  if (sameDay) return MONTH_FMT.format(from);
  return `${MONTH_FMT.format(from)} – ${MONTH_FMT.format(to)}`;
}
