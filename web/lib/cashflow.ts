import { CATEGORY_SERIES, SOURCE_SERIES, YEAR } from "./insights-data";

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

const SOURCE_COLORS = ["#22C55E", "#4ade80", "#16a34a", "#86efac"];
export const SOURCE_COLOR_MAP: Record<string, string> = {
  salary: SOURCE_COLORS[0],
  northwind: SOURCE_COLORS[1],
  freelance: SOURCE_COLORS[2],
  adhoc: SOURCE_COLORS[3],
};
const SAVINGS_COLOR = "#4a55c9";
const MID_COLOR = "#16A34A";

/** Build a Nivo-compatible three-column income → expenses/savings flow. */
export function buildSankey(month: number): SankeyGraph {
  const income = YEAR[month]?.income ?? 0;
  const sources = SOURCE_SERIES.map((s, i) => ({
    id: s.id,
    name: s.name,
    value: s.monthly[month] ?? 0,
    color: SOURCE_COLORS[i % SOURCE_COLORS.length],
  })).filter((s) => s.value > 0);

  const cats = CATEGORY_SERIES.map((c) => ({
    id: c.id,
    name: c.name,
    value: c.monthly[month] ?? 0,
    color: c.dot,
  }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
  const topCats = cats.slice(0, 6);
  const rest = cats.slice(6).reduce((sum, category) => sum + category.value, 0);
  if (rest > 0) topCats.push({ id: "rest", name: "Other", value: rest, color: "#8a8b91" });

  const spent = topCats.reduce((sum, category) => sum + category.value, 0);
  const savings = Math.max(0, income - spent);
  const rightItems = [...topCats, { id: "savings", name: "Savings", value: savings, color: SAVINGS_COLOR }];

  return {
    nodes: [
      ...sources.map((source) => ({ id: source.id, label: source.name, color: source.color })),
      { id: "income", label: "Income", color: MID_COLOR },
      ...rightItems
        .filter((item) => item.value > 0)
        .map((item) => ({ id: item.id, label: item.name, color: item.color })),
    ],
    links: [
      ...sources.map((source) => ({ source: source.id, target: "income", value: source.value, startColor: source.color, endColor: MID_COLOR })),
      ...rightItems
        .filter((item) => item.value > 0)
        .map((item) => ({ source: "income", target: item.id, value: item.value, startColor: MID_COLOR, endColor: item.color })),
    ],
  };
}


export interface StackDatum {
  month: string;
  segments: { id: string; name: string; value: number; color: string }[];
  savings: number;
}

/** Monthly stacked bars: top categories + savings remainder on top. */
export function buildStacks(): StackDatum[] {
  const months = ["Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];
  const topIds = ["housing", "groceries", "investments", "shopping", "utilities"];
  const meta = (id: string) => CATEGORY_SERIES.find((c) => c.id === id)!;
  return [2, 3, 4, 5, 6, 7, 8].map((m, i) => {
    const segments = topIds.map((id) => {
      const c = meta(id);
      return { id, name: c.name, value: c.monthly[m] ?? 0, color: c.dot };
    });
    const spent = segments.reduce((s, x) => s + x.value, 0);
    const others = CATEGORY_SERIES.filter((c) => !topIds.includes(c.id)).reduce((s, c) => s + (c.monthly[m] ?? 0), 0);
    const save = Math.max(0, (YEAR[m]?.income ?? 0) - spent - others);
    return { month: months[i], segments: [...segments, { id: "rest", name: "Other", value: others, color: "#c4c2bc" }], savings: save };
  });
}
