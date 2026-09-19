export const MONTH = { label: "September", income: 48290, expenses: 18340 };

export const TAX_POSITION = { estimated: 18240, paid: 12180 };

export interface TaxDoc {
  id: string;
  label: string;
  done: boolean;
}

export const TAX_DOCS: TaxDoc[] = [
  { id: "w2", label: "W-2 — Acme Retail", done: true },
  { id: "nec", label: "1099-NEC — Northwind", done: true },
  { id: "int", label: "1099-INT — Mercury", done: false },
  { id: "charity", label: "Charitable receipts", done: false },
  { id: "home", label: "Home office worksheet", done: true },
  { id: "prior", label: "Prior-year return", done: true },
];

export type TxSource = "manual" | "email" | "card" | "wallet";

export interface Tx {
  id: string;
  name: string;
  date: string;
  amount: number;
  source: TxSource;
}

export const TRANSACTIONS: Tx[] = [
  { id: "t1", name: "Rent Payment", date: "Sep 1", amount: -1350, source: "card" },
  { id: "t2", name: "Invoice #0192", date: "Sep 3", amount: 2400, source: "email" },
  { id: "t3", name: "Whole Foods", date: "Sep 5", amount: -92.4, source: "wallet" },
  { id: "t4", name: "Freelance payout", date: "Sep 8", amount: 1850, source: "manual" },
  { id: "t5", name: "Electricity Bill", date: "Sep 10", amount: -40, source: "email" },
];

export interface Category {
  id: string;
  name: string;
  emoji: string;
  spent: number;
  budget: number;
  dot: string;
}

export const BUDGET_LIMIT = 9300;

export const CATEGORIES: Category[] = [
  { id: "housing", name: "Housing", emoji: "🏠", spent: 2880, budget: 6000, dot: "#a855f7" },
  { id: "groceries", name: "Groceries", emoji: "🛒", spent: 412, budget: 600, dot: "#ad7f22" },
  { id: "transport", name: "Transport", emoji: "🚕", spent: 150, budget: 400, dot: "#4a55c9" },
  { id: "dining", name: "Dining", emoji: "🍽", spent: 90, budget: 300, dot: "#b0402f" },
  { id: "shopping", name: "Shopping", emoji: "🛍", spent: 147, budget: 300, dot: "#7c3aed" },
  { id: "investments", name: "Investments", emoji: "📈", spent: 1193, budget: 300, dot: "#b0402f" },
  { id: "date", name: "Date", emoji: "💌", spent: 310, budget: 900, dot: "#0d9488" },
  { id: "education", name: "Education", emoji: "📚", spent: 100, budget: 900, dot: "#4a55c9" },
  { id: "utilities", name: "Utilities", emoji: "💡", spent: 97, budget: 300, dot: "#35754e" },
  { id: "other", name: "Other", emoji: "📦", spent: 93, budget: 0, dot: "#8a8b91" },
];

export const TAX_DUE = { label: "Extended return due Oct 15", sub: "27 days left" };

export interface AttentionItem {
  id: string;
  title: string;
  sub: string;
  action: string;
}

export const ATTENTION: AttentionItem[] = [
  { id: "a1", title: "3 uncategorized transactions", sub: "Review to keep reports accurate", action: "Review" },
  { id: "a2", title: "Missing receipt — Whole Foods $92.40", sub: "Snap a photo or forward the email", action: "Upload" },
  { id: "a3", title: "Possible duplicate — Electricity Bill", sub: "Two $40.00 charges on Sep 10", action: "Review" },
  { id: "a4", title: "1099-INT not received", sub: "Mercury usually sends it by Jan 31", action: "Docs" },
];
