export interface SankeyNode {
  id: string;
  label: string;
  color: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
  startColor?: string;
  endColor?: string;
}

export interface SankeyGraph {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

export type InsightCategory = {
  categoryId: string | null;
  name: string;
  color: string | null;
  amount: number;
};

export type InsightSource = {
  source: string;
  income: number;
  expenses: number;
};

export type MonthlySummary = {
  month: string;
  income: number;
  expenses: number;
};

export type MonthlyCategory = {
  month: string;
  categoryId: string | null;
  name: string;
  color: string | null;
  amount: number;
};

export type MonthlyIncomeSource = {
  month: string;
  source: string;
  amount: number;
};

export type InsightsSummary = {
  currency: string;
  totals: { income: number; expenses: number; net: number; savingRate: number };
  spendingByCategory: InsightCategory[];
  incomeAndSpendingBySource: InsightSource[];
  monthly: MonthlySummary[];
  monthlySpendingByCategory: MonthlyCategory[];
  monthlyIncomeBySource: MonthlyIncomeSource[];
  transactionCount: number;
};

const SOURCE_COLORS = ["#22C55E", "#4ade80", "#16a34a", "#86efac"];
const CATEGORY_COLORS = ["#a855f7", "#ad7f22", "#4a55c9", "#b0402f", "#7c3aed", "#0d9488", "#3a44a8", "#35754e", "#8a8b91"];
const SAVINGS_COLOR = "#4a55c9";
const MID_COLOR = "#16A34A";

export const SOURCE_COLOR_MAP: Record<string, string> = {
  salary: SOURCE_COLORS[0],
  northwind: SOURCE_COLORS[1],
  freelance: SOURCE_COLORS[2],
  adhoc: SOURCE_COLORS[3],
};

function fallbackColor(index: number) {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length]!;
}

export function buildSankey(sources: InsightSource[], categories: InsightCategory[]): SankeyGraph {
  const sourceItems = sources
    .filter((source) => source.income > 0)
    .sort((left, right) => right.income - left.income)
    .map((source, index) => ({
      id: `source:${source.source}`,
      name: source.source,
      value: source.income,
      color: SOURCE_COLOR_MAP[source.source.toLowerCase()] ?? fallbackColor(index),
    }));
  const categoryItems = categories
    .filter((category) => category.amount > 0)
    .sort((left, right) => right.amount - left.amount)
    .map((category, index) => ({
      id: `category:${category.categoryId ?? "uncategorized"}`,
      name: category.name,
      value: category.amount,
      color: category.color ?? fallbackColor(index),
    }));

  const income = sourceItems.reduce((sum, source) => sum + source.value, 0);
  if (income <= 0 || sourceItems.length === 0) return { nodes: [], links: [] };

  const spent = categoryItems.reduce((sum, category) => sum + category.value, 0);
  const savings = Math.max(0, income - spent);
  const rightItems = [...categoryItems];
  if (savings > 0) rightItems.push({ id: "savings", name: "Savings", value: savings, color: SAVINGS_COLOR });
  if (rightItems.length === 0) return { nodes: [], links: [] };

  return {
    nodes: [
      ...sourceItems.map((source) => ({ id: source.id, label: source.name, color: source.color })),
      { id: "income", label: "Income", color: MID_COLOR },
      ...rightItems.map((item) => ({ id: item.id, label: item.name, color: item.color })),
    ],
    links: [
      ...sourceItems.map((source) => ({ source: source.id, target: "income", value: source.value, startColor: source.color, endColor: MID_COLOR })),
      ...rightItems.map((item) => ({ source: "income", target: item.id, value: item.value, startColor: MID_COLOR, endColor: item.color })),
    ],
  };
}

export interface StackDatum {
  month: string;
  segments: { id: string; name: string; value: number; color: string }[];
  savings: number;
}

export function buildStacks(monthly: MonthlySummary[], monthlyCategories: MonthlyCategory[]): StackDatum[] {
  const categoriesByMonth = new Map<string, MonthlyCategory[]>();
  for (const category of monthlyCategories) {
    const current = categoriesByMonth.get(category.month) ?? [];
    current.push(category);
    categoriesByMonth.set(category.month, current);
  }

  return [...monthly]
    .sort((left, right) => left.month.localeCompare(right.month))
    .map((summary) => {
      const segments = (categoriesByMonth.get(summary.month) ?? [])
        .filter((category) => category.amount > 0)
        .map((category, index) => ({
          id: category.categoryId ?? "uncategorized",
          name: category.name,
          value: category.amount,
          color: category.color ?? fallbackColor(index),
        }));
      return {
        month: new Intl.DateTimeFormat("en", { month: "short" }).format(new Date(`${summary.month}-01T00:00:00.000Z`)),
        segments,
        savings: Math.max(0, summary.income - summary.expenses),
      };
    });
}
