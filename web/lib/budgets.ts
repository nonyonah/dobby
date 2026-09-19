import { MONTH, CATEGORIES } from "./finance";
import { TRANSACTIONS_FULL } from "./transactions";
import type { TxSource } from "./finance";

export interface BudgetDef {
  type: "fixed" | "percent";
  /** dollars when fixed, percent number when percent */
  value: number;
  excluded?: boolean;
  emoji?: string;
}

export const INITIAL_BUDGETS: Record<string, BudgetDef> = {
  housing: { type: "fixed", value: 6000 },
  groceries: { type: "fixed", value: 600 },
  utilities: { type: "fixed", value: 300 },
  transport: { type: "fixed", value: 400 },
  dining: { type: "fixed", value: 300 },
  shopping: { type: "fixed", value: 300 },
  education: { type: "fixed", value: 900 },
  investments: { type: "fixed", value: 300 },
  date: { type: "fixed", value: 900 },
  other: { type: "fixed", value: 0, excluded: true },
};

export function budgetAmount(def: BudgetDef): number {
  if (def.type === "percent") return Math.round((def.value / 100) * MONTH.income);
  return def.value;
}

export function categorySpent(catId: string): number {
  return CATEGORIES.find((c) => c.id === catId)?.spent ?? 0;
}

export type FeedKey = "gmail" | "cards" | "wallets" | "manual";

export const FEED_LABEL: Record<FeedKey, string> = {
  gmail: "Gmail",
  cards: "Cards",
  wallets: "Wallets",
  manual: "Manual",
};

const SOURCE_FEED: Record<TxSource, FeedKey> = {
  email: "gmail",
  card: "cards",
  wallet: "wallets",
  manual: "manual",
};

export function feedTotals(catId: string): Record<FeedKey, number> {
  const totals: Record<FeedKey, number> = { gmail: 0, cards: 0, wallets: 0, manual: 0 };
  for (const t of TRANSACTIONS_FULL) {
    if (t.category !== catId || t.amount >= 0) continue;
    totals[SOURCE_FEED[t.source]] += Math.abs(t.amount);
  }
  return totals;
}

function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface MonthBar {
  month: string;
  spent: number;
}

const BAR_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthlyBars(catId: string, budget: number): MonthBar[] {
  let seed = hashSeed(catId);
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return BAR_MONTHS.map((month, i) => ({
    month,
    spent: Math.round(budget * (0.55 + rand() * 0.5) * (i > 8 ? 0.6 : 1)),
  }));
}

export function budgetStatus(spent: number, budget: number): "ok" | "near" | "over" {
  if (budget <= 0) return "ok";
  const pct = spent / budget;
  if (pct >= 1) return "over";
  if (pct >= 0.8) return "near";
  return "ok";
}

export const STATUS_BAR: Record<ReturnType<typeof budgetStatus>, string> = {
  ok: "#22C55E",
  near: "#F59E0B",
  over: "#F04438",
};
