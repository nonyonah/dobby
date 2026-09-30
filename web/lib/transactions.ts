import type { TxSource } from "./finance";

export type TaxFilter = "all" | "taxable" | "nontaxable";
export type SourceFilter = "all" | TxSource;
export type DateFilter = "all" | "7d" | "30d" | "90d";
export type SortKey = "date" | "name" | "amount";
export type SortDir = "asc" | "desc";

export interface CategoryMeta {
  id: string;
  label: string;
  emoji: string;
  /**
   * Chip background. Chips render this inline rather than as a Tailwind class
   * so a colour the user picked in Settings can be shown without generating
   * classes at runtime. Every value keeps white label text above 4.5:1.
   */
  hex: string;
  pill: string;
  dot: string;
}

/** Offered in the category colour picker; matches the API's palette. */
export const CATEGORY_PALETTE = [
  "#0f766e", "#b45309", "#1d4ed8", "#be123c", "#7c3aed", "#0e7490",
  "#a16207", "#15803d", "#c2410c", "#4338ca", "#9d174d", "#065f46",
  "#92400e", "#1e3a8a", "#86198f", "#155e75", "#3f6212", "#831843",
] as const;

const chip = (hex: string) => `border-transparent text-white`;

/**
 * Each built-in category gets its own colour — the previous palette reused
 * three pastels across ten categories, so chips were hard to tell apart. The
 * same ten also seed a user's first custom categories.
 */
export const TX_CATEGORIES: CategoryMeta[] = [
  { id: "groceries", label: "Groceries", emoji: "🛒", hex: "#0f766e", pill: chip("#0f766e"), dot: "#0f766e" },
  { id: "housing", label: "Housing", emoji: "🏠", hex: "#b45309", pill: chip("#b45309"), dot: "#b45309" },
  { id: "utilities", label: "Utilities", emoji: "💡", hex: "#1d4ed8", pill: chip("#1d4ed8"), dot: "#1d4ed8" },
  { id: "transport", label: "Transport", emoji: "🚕", hex: "#be123c", pill: chip("#be123c"), dot: "#be123c" },
  { id: "dining", label: "Dining", emoji: "🍽", hex: "#7c3aed", pill: chip("#7c3aed"), dot: "#7c3aed" },
  { id: "shopping", label: "Shopping", emoji: "🛍", hex: "#0e7490", pill: chip("#0e7490"), dot: "#0e7490" },
  { id: "education", label: "Education", emoji: "📚", hex: "#a16207", pill: chip("#a16207"), dot: "#a16207" },
  { id: "income", label: "Income", emoji: "💵", hex: "#15803d", pill: chip("#15803d"), dot: "#15803d" },
  { id: "investments", label: "Investments", emoji: "📈", hex: "#c2410c", pill: chip("#c2410c"), dot: "#c2410c" },
  { id: "other", label: "Other", emoji: "📦", hex: "#4338ca", pill: chip("#4338ca"), dot: "#4338ca" },
];

/**
 * Resolves a chip colour. A colour the user chose for their own category wins;
 * built-ins keep their assigned colour; anything else gets a stable colour
 * derived from its id so two different custom categories never collide.
 */
export function categoryHex(id: string, storedColor?: string | null): string {
  if (storedColor && /^#[0-9a-fA-F]{6}$/.test(storedColor)) return storedColor.toLowerCase();
  const builtIn = TX_CATEGORIES.find((entry) => entry.id === id);
  if (builtIn) return builtIn.hex;
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length];
}

export const categoryMeta = (id: string, fallbackName?: string, storedColor?: string | null): CategoryMeta => {
  const builtIn = TX_CATEGORIES.find((entry) => entry.id === id);
  if (builtIn && !storedColor) return builtIn;
  const hex = categoryHex(id, storedColor);
  return {
    id,
    label: builtIn?.label ?? fallbackName ?? id,
    emoji: builtIn?.emoji ?? "📦",
    hex,
    pill: chip(hex),
    dot: hex,
  };
};

export type ParseState = "parsed" | "review" | "manual";

export interface TxFull {
  id: string;
  name: string;
  account: string;
  date: string; // ISO
  amount: number; // signed display amount: + income, − spend
  sourceAmount?: number;
  currency?: string;
  needsManualReview?: boolean;
  category: string;
  categoryId?: string;
  categoryName?: string;
  /** Colour the user assigned to this category, when set. */
  categoryColor?: string | null;
  kind?: "INCOME" | "EXPENSE" | "TRANSFER";
  /** Settlement asset for wallet/chain transactions, e.g. `USDC`, `USDT`, `CNGN`. */
  asset?: string;
  taxable: boolean;
  source: TxSource;
  parse: { state: ParseState; confidence?: number };
  note: string;
}

export const TRANSACTIONS_FULL: TxFull[] = [
  { id: "x01", name: "Whole Foods Market", account: "Mercury ··4821", date: "2026-09-18", amount: -92.4, category: "groceries", taxable: false, source: "card", parse: { state: "parsed", confidence: 98 }, note: "" },
  { id: "x02", name: "Invoice #0192 — Northwind", account: "Mercury ··4821", date: "2026-09-18", amount: 2400, category: "income", taxable: true, source: "email", parse: { state: "parsed", confidence: 96 }, note: "Paid on receipt" },
  { id: "x03", name: "Rent Payment", account: "Chase ··3567", date: "2026-09-17", amount: -1350, category: "housing", taxable: false, source: "card", parse: { state: "parsed", confidence: 99 }, note: "" },
  { id: "x04", name: "Uber Ride", account: "Amex ··1005", date: "2026-09-17", amount: -18, category: "transport", taxable: true, source: "wallet", parse: { state: "manual" }, note: "Client visit" },
  { id: "x05", name: "Electricity Bill", account: "Chase ··3567", date: "2026-09-17", amount: -40, category: "utilities", taxable: false, source: "email", parse: { state: "review", confidence: 71 }, note: "" },
  { id: "x06", name: "Freelance payout", account: "Mercury ··4821", date: "2026-09-16", amount: 1850, category: "income", taxable: true, source: "manual", parse: { state: "manual" }, note: "August retainer" },
  { id: "x07", name: "Netflix Subscription", account: "Amex ··1005", date: "2026-09-16", amount: -16, category: "other", taxable: false, source: "card", parse: { state: "parsed", confidence: 97 }, note: "" },
  { id: "x08", name: "Dinner Date", account: "Amex ··1005", date: "2026-09-15", amount: -60, category: "dining", taxable: false, source: "wallet", parse: { state: "manual" }, note: "" },
  { id: "x09", name: "Internet Bill", account: "Chase ··3567", date: "2026-09-15", amount: -80, category: "housing", taxable: false, source: "email", parse: { state: "parsed", confidence: 93 }, note: "" },
  { id: "x10", name: "Mandarin course", account: "Chase ··3567", date: "2026-09-14", amount: -200, category: "education", taxable: true, source: "card", parse: { state: "review", confidence: 68 }, note: "Check deductibility" },
  { id: "x11", name: "GShock", account: "Amex ··1005", date: "2026-09-13", amount: -120, category: "shopping", taxable: false, source: "wallet", parse: { state: "manual" }, note: "" },
  { id: "x12", name: "Buy VOO ETF", account: "Schwab ··7741", date: "2026-09-12", amount: -42.75, category: "investments", taxable: false, source: "card", parse: { state: "parsed", confidence: 95 }, note: "" },
  { id: "x13", name: "Monthly Salary", account: "Chase ··3567", date: "2026-09-11", amount: 4500, category: "income", taxable: true, source: "manual", parse: { state: "manual" }, note: "Net pay" },
  { id: "x14", name: "Water Utility Bill", account: "Chase ··3567", date: "2026-09-10", amount: -42, category: "utilities", taxable: false, source: "email", parse: { state: "parsed", confidence: 91 }, note: "" },
  { id: "x15", name: "Pizza Party", account: "Amex ··1005", date: "2026-09-09", amount: -30, category: "dining", taxable: false, source: "card", parse: { state: "parsed", confidence: 94 }, note: "Team lunch" },
  { id: "x16", name: "Amazon Purchase", account: "Amex ··1005", date: "2026-09-08", amount: -12, category: "shopping", taxable: false, source: "email", parse: { state: "review", confidence: 74 }, note: "" },
  { id: "x17", name: "Powerbank", account: "Amex ··1005", date: "2026-09-07", amount: -15, category: "shopping", taxable: true, source: "wallet", parse: { state: "manual" }, note: "" },
  { id: "x18", name: "Mobile Phone Bill", account: "Chase ··3567", date: "2026-09-05", amount: -55, category: "utilities", taxable: false, source: "card", parse: { state: "parsed", confidence: 96 }, note: "" },
  { id: "x19", name: "Hotel Reservation", account: "Amex ··1005", date: "2026-09-03", amount: -100, category: "other", taxable: true, source: "email", parse: { state: "parsed", confidence: 92 }, note: "Conference" },
  { id: "x20", name: "Pharmacy Purchase", account: "Chase ··3567", date: "2026-09-01", amount: -24.5, category: "other", taxable: false, source: "card", parse: { state: "parsed", confidence: 90 }, note: "" },
  { id: "x21", name: "Iphone case", account: "Amex ··1005", date: "2026-08-28", amount: -10, category: "shopping", taxable: false, source: "wallet", parse: { state: "manual" }, note: "" },
  { id: "x22", name: "Laundry", account: "Cash", date: "2026-08-26", amount: -20, category: "housing", taxable: false, source: "manual", parse: { state: "manual" }, note: "" },
  { id: "x23", name: "Perfume", account: "Amex ··1005", date: "2026-08-24", amount: -80, category: "shopping", taxable: false, source: "card", parse: { state: "parsed", confidence: 89 }, note: "" },
  { id: "x24", name: "Transfer to Savings", account: "Chase ··3567", date: "2026-08-20", amount: -50, category: "other", taxable: false, source: "manual", parse: { state: "manual" }, note: "" },
];

export function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const today = new Date("2026-09-18T12:00:00");
  const days = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function csvCell(value: string | number | boolean): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadTransactions(rows: TxFull[]) {
  const header = ["Date", "Merchant", "Account", "Category", "Amount", "Taxable", "Source", "Note"];
  const lines = rows.map((t) =>
    [
      t.date,
      t.name,
      t.account,
      categoryMeta(t.category).label,
      t.amount.toFixed(2),
      t.taxable ? "yes" : "no",
      t.source,
      t.note,
    ]
      .map(csvCell)
      .join(",")
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "transactions.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
