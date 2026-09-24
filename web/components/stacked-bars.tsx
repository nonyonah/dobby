"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { formatUSD } from "@/lib/format";
import type { StackDatum } from "@/lib/cashflow";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "./ui/chart";

const SAVINGS_COLOR = "#4a55c9";

export function StackedBars({ data }: { data: StackDatum[] }) {
  const categoryById = new Map<string, { name: string; color: string; total: number }>();
  for (const month of data) {
    for (const segment of month.segments) {
      const current = categoryById.get(segment.id) ?? { name: segment.name, color: segment.color, total: 0 };
      current.total += segment.value;
      categoryById.set(segment.id, current);
    }
  }
  const categories = [...categoryById.entries()].sort((left, right) => right[1].total - left[1].total);
  const keys = [...categories.map(([id]) => id), "savings"];
  const colors = Object.fromEntries(categories.map(([id, item]) => [id, item.color])) as Record<string, string>;
  colors.savings = SAVINGS_COLOR;
  const chartData = data.map((month) => {
    const row: Record<string, string | number> = { month: month.month };
    for (const segment of month.segments) row[segment.id] = segment.value;
    row.savings = month.savings;
    return row;
  });
  const config = Object.fromEntries([
    ...categories.map(([id, item]) => [id, { label: item.name, color: item.color }]),
    ["savings", { label: "Savings", color: SAVINGS_COLOR }],
  ]) as ChartConfig;
  const hasData = chartData.some((row) => keys.some((key) => Number(row[key] ?? 0) > 0));

  if (!hasData) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-lg border border-dashed border-line text-center" role="status">
        <p className="m-0 px-4 text-[13px] text-muted-foreground">No monthly spending or savings data yet.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        {[
          ...categories.map(([id, item]) => ({ id, name: item.name })),
          { id: "savings", name: "Savings" },
        ].map((item) => (
          <span key={item.id} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: colors[item.id] }} />
            {item.name}
          </span>
        ))}
      </div>
      <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
        <BarChart accessibilityLayer data={chartData} margin={{ top: 12, right: 4, left: 4, bottom: 0 }} barCategoryGap="12%">
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} dy={8} tick={{ fill: "var(--chart-tick)", fontSize: 11 }} />
          <YAxis
            width={56}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--chart-tick)", fontSize: 11 }}
            tickFormatter={(value: number) => (Math.abs(value) >= 1000 ? `${formatUSD(value).replace(/[\d.,\s]/g, "")} ${Math.round(value / 1000)}k` : formatUSD(value))}
          />
          <ChartTooltip
            cursor={{ fill: "var(--chart-cursor)", fillOpacity: 0.6 }}
            content={<ChartTooltipContent className="bg-card" formatter={(value) => formatUSD(Number(value))} />}
          />
          {keys.map((key, index) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="total"
              fill={colors[key]}
              radius={index === keys.length - 1 ? [5, 5, 0, 0] : [0, 0, 0, 0]}
              maxBarSize={34}
            />
          ))}
        </BarChart>
      </ChartContainer>
    </div>
  );
}
