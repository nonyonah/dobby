"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { formatUSD } from "@/lib/format";
import { buildStacks } from "@/lib/cashflow";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "./ui/chart";

const SAVINGS_COLOR = "#4a55c9";

export function StackedBars() {
  const raw = buildStacks();
  const keys = ["housing", "groceries", "investments", "shopping", "utilities", "rest", "savings"];
  const colors: Record<string, string> = {
    housing: "#a855f7",
    groceries: "#ad7f22",
    investments: "#0d9488",
    shopping: "#7c3aed",
    utilities: "#35754e",
    rest: "#c4c2bc",
    savings: SAVINGS_COLOR,
  };
  const data = raw.map((d) => {
    const row: Record<string, string | number> = { month: d.month };
    for (const s of d.segments) row[s.id] = s.value;
    row.savings = d.savings;
    return row;
  });
  const config: ChartConfig = {
    income: { label: "Amount", color: "#22C55E" },
  };

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">
        {[
          { id: "housing", name: "Housing" },
          { id: "groceries", name: "Groceries" },
          { id: "investments", name: "Investments" },
          { id: "shopping", name: "Shopping" },
          { id: "utilities", name: "Utilities" },
          { id: "rest", name: "Other" },
          { id: "savings", name: "Savings" },
        ].map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: colors[s.id] }} />
            {s.name}
          </span>
        ))}
      </div>
      <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
        <BarChart accessibilityLayer data={data} margin={{ top: 12, right: 4, left: 4, bottom: 0 }} barCategoryGap="12%">
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} dy={8} tick={{ fill: "var(--chart-tick)", fontSize: 11 }} />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--chart-tick)", fontSize: 11 }}
            tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`)}
          />
          <ChartTooltip
            cursor={{ fill: "var(--chart-cursor)", fillOpacity: 0.6 }}
            content={<ChartTooltipContent className="bg-white dark:bg-[#1a1a1d]" formatter={(v) => formatUSD(Number(v))} />}
          />
          {keys.map((k, ki) => (
            <Bar
              key={k}
              dataKey={k}
              stackId="total"
              fill={colors[k]}
              radius={ki === keys.length - 1 ? [5, 5, 0, 0] : [0, 0, 0, 0]}
              maxBarSize={34}
            />
          ))}
        </BarChart>
      </ChartContainer>
    </div>
  );
}
