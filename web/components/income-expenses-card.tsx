"use client";

import { useMemo } from "react";
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";
import { formatUSD } from "@/lib/format";
import { MONTH } from "@/lib/finance";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "./ui/chart";
import { ModuleCard } from "./module-card";

export function IncomeExpensesCard() {
  const net = MONTH.income - MONTH.expenses;
  const data = useMemo(
    () => [
      { k: "Income", v: MONTH.income, fill: "#22C55E" },
      { k: "Expenses", v: MONTH.expenses, fill: "#F04438" },
    ],
    []
  );
  const config = useMemo(
    () => ({ v: { label: "Amount", color: "#4a55c9" } }) satisfies ChartConfig,
    []
  );

  return (
    <ModuleCard title={`${MONTH.label} income vs expenses`} linkLabel="Transactions">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="m-0 text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">Income</p>
          <p className="mono m-0 text-[20px] font-semibold tracking-[-0.02em] tabular-nums">
            {formatUSD(MONTH.income)}
          </p>
        </div>
        <div>
          <p className="m-0 text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">Expenses</p>
          <p className="mono m-0 text-[20px] font-semibold tracking-[-0.02em] tabular-nums">
            {formatUSD(MONTH.expenses)}
          </p>
        </div>
      </div>
      <div className="mt-2">
        <span className="inline-flex items-center rounded-full border border-[#A7F3D0] bg-[#D1FAE5] px-2 py-0.5 text-[12px] font-semibold text-[#047857] dark:border-[#047857] dark:bg-[#064e3b] dark:text-[#6ee7b7]">
          +{formatUSD(net)} saved
        </span>
      </div>
      <ChartContainer config={config} className="aspect-auto h-[120px] w-full">
        <BarChart accessibilityLayer data={data} margin={{ top: 12, right: 4, left: 4, bottom: 0 }} barCategoryGap="28%">
          <XAxis dataKey="k" tickLine={false} axisLine={false} dy={8} tick={{ fill: "var(--chart-tick)", fontSize: 11 }} />
          <YAxis hide />
          <ChartTooltip
            cursor={{ fill: "var(--chart-cursor)", fillOpacity: 0.6 }}
            content={<ChartTooltipContent className="bg-white dark:bg-[#1a1a1d]" formatter={(value) => formatUSD(Number(value))} />}
          />
          <Bar dataKey="v" radius={[6, 6, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.k} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </ModuleCard>
  );
}
