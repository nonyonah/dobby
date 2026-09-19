import type { TxFull } from "./transactions";

export interface RecurringPattern {
  id: string;
  merchant: string;
  category: string;
  amount: number;
  intervalDays: number;
  cadence: string;
  nextDate: string;
  occurrences: number;
  transactions: TxFull[];
}

// Mock history gives the detector enough observations to demonstrate the flow
// until a real transaction history/index is connected.
export const MOCK_RECURRING_HISTORY: TxFull[] = [
  ...["2026-07-16", "2026-08-16", "2026-09-16"].map((date, index) => ({
    id: `rec-netflix-${index}`,
    name: "Netflix Subscription",
    account: "Amex ··1005",
    date,
    amount: -16,
    category: "other",
    taxable: false,
    source: "card" as const,
    parse: { state: "parsed" as const, confidence: 97 },
    note: "",
  })),
  ...["2026-06-15", "2026-07-15", "2026-08-15", "2026-09-15"].map((date, index) => ({
    id: `rec-internet-${index}`,
    name: "Internet Bill",
    account: "Chase ··3567",
    date,
    amount: -80,
    category: "housing",
    taxable: false,
    source: "email" as const,
    parse: { state: "parsed" as const, confidence: 93 },
    note: "",
  })),
  ...["2026-06-17", "2026-07-17", "2026-08-17", "2026-09-17"].map((date, index) => ({
    id: `rec-electric-${index}`,
    name: "Electricity Bill",
    account: "Chase ··3567",
    date,
    amount: [-38, -42, -40, -40][index],
    category: "utilities",
    taxable: false,
    source: "email" as const,
    parse: { state: "parsed" as const, confidence: 91 },
    note: "",
  })),
];

function cadenceFor(days: number): string {
  if (days <= 9) return "Weekly";
  if (days <= 20) return "Every 2 weeks";
  if (days <= 45) return "Monthly";
  return `Every ${Math.round(days / 30)} months`;
}

/** Groups same-merchant charges and accepts stable interval/amount patterns. */
export function detectRecurringTransactions(rows: TxFull[]): RecurringPattern[] {
  const groups = new Map<string, TxFull[]>();
  for (const row of rows.filter((tx) => tx.amount < 0)) {
    const key = row.name.toLowerCase().replace(/\s+(bill|subscription)$/i, "").trim();
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return [...groups.entries()]
    .map(([key, transactions]) => {
      const byDate = new Map(transactions.map((transaction) => [transaction.date, transaction]));
      const sorted = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
      if (sorted.length < 3) return null;
      const intervals = sorted.slice(1).map((tx, index) => {
        const previous = new Date(`${sorted[index].date}T12:00:00`).getTime();
        return Math.round((new Date(`${tx.date}T12:00:00`).getTime() - previous) / 86400000);
      });
      const intervalDays = Math.round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length);
      const averageAmount = sorted.reduce((sum, tx) => sum + Math.abs(tx.amount), 0) / sorted.length;
      const stableInterval = intervals.every((value) => Math.abs(value - intervalDays) <= 4);
      const stableAmount = sorted.every((tx) => Math.abs(Math.abs(tx.amount) - averageAmount) / averageAmount <= 0.15);
      if (!stableInterval || !stableAmount) return null;
      const last = sorted[sorted.length - 1];
      const next = new Date(`${last.date}T12:00:00`);
      next.setDate(next.getDate() + intervalDays);
      return {
        id: `pattern-${key.replace(/[^a-z0-9]+/g, "-")}`,
        merchant: last.name,
        category: last.category,
        amount: averageAmount,
        intervalDays,
        cadence: cadenceFor(intervalDays),
        nextDate: next.toISOString().slice(0, 10),
        occurrences: sorted.length,
        transactions: sorted,
      } satisfies RecurringPattern;
    })
    .filter((pattern): pattern is RecurringPattern => pattern !== null)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}
