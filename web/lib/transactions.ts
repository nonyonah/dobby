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
  pill: string;
  dot: string;
}

export const TX_CATEGORIES: CategoryMeta[] = [
  { id: "groceries", label: "Groceries", emoji: "🛒", pill: "border-transparent bg-[#ffafcc] text-white", dot: "#ad7f22" },
  { id: "housing", label: "Housing", emoji: "🏠", pill: "border-transparent bg-[#a2d2ff] text-white", dot: "#7c3aed" },
  { id: "utilities", label: "Utilities", emoji: "💡", pill: "border-transparent bg-[#cdb4db] text-white", dot: "#0d9488" },
  { id: "transport", label: "Transport", emoji: "🚕", pill: "border-transparent bg-[#ffc8dd] text-white", dot: "#4a55c9" },
  { id: "dining", label: "Dining", emoji: "🍽", pill: "border-transparent bg-[#a2d2ff] text-white", dot: "#b0402f" },
  { id: "shopping", label: "Shopping", emoji: "🛍", pill: "border-transparent bg-[#ffafcc] text-white", dot: "#ad7f22" },
  { id: "education", label: "Education", emoji: "📚", pill: "border-transparent bg-[#ffc8dd] text-white", dot: "#3a44a8" },
  { id: "income", label: "Income", emoji: "💵", pill: "border-transparent bg-[#cdb4db] text-white", dot: "#35754e" },
  { id: "investments", label: "Investments", emoji: "📈", pill: "border-transparent bg-[#a2d2ff] text-white", dot: "#7c3aed" },
  { id: "other", label: "Other", emoji: "📦", pill: "border-transparent bg-[#cdb4db] text-white", dot: "#8a8b91" },
];

export const categoryMeta = (id: string): CategoryMeta =>
  TX_CATEGORIES.find((c) => c.id === id) ?? TX_CATEGORIES[TX_CATEGORIES.length - 1];

export type ParseState = "parsed" | "review" | "manual";

export interface TxFull {
  id: string;
  name: string;
  account: string;
  date: string; // ISO
  amount: number; // signed: + income, − spend
  category: string;
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
