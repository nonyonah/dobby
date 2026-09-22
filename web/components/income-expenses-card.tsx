"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";
import { formatUSD } from "@/lib/format";
import { MONTH } from "@/lib/finance";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "./ui/chart";
import { ModuleCard } from "./module-card";
import { useApi } from "@/hooks/use-api";

export function IncomeExpensesCard() {
  const [summary, setSummary] = useState<{ income: number; expenses: number } | null>(null);
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const from = new Date(2026, 8, 1).toISOString();
    const to = new Date(2026, 8, 30, 23, 59, 59).toISOString();
    void api.get<{ data: { totals: { income: number; expenses: number } } }>(`/v1/insights/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then((response) => setSummary(response.data.totals)).catch(() => setSummary(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);
  const income = summary?.income ?? MONTH.income;
  const expenses = summary?.expenses ?? MONTH.expenses;
  const net = income - expenses;
  const data = useMemo(
    () => [
      { k: "Income", v: income, fill: "#00afb9" },
      { k: "Expenses", v: expenses, fill: "#ef476f" }
    ],
    [income, expenses]
  );
  const config = useMemo(
    () => ({ v: { label: "Amount", color: "#4a55c9" } }) satisfies ChartConfig,
    []
  );

  return (
    <ModuleCard title={`${MONTH.label} income vs expenses`} linkLabel="Transactions">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="m-0 text-[12px] text-muted-foreground">Income</p>
          <p className="mono m-0 text-[20px] font-semibold tracking-[-0.02em] tabular-nums">
            {formatUSD(income)}
          </p>
        </div>
        <div>
          <p className="m-0 text-[12px] text-muted-foreground">Expenses</p>
          <p className="mono m-0 text-[20px] font-semibold tracking-[-0.02em] tabular-nums">
            {formatUSD(expenses)}
          </p>
        </div>
      </div>
      <div className="mt-2">
        <span className="inline-flex items-center rounded-full border-transparent bg-[#00afb9] px-2 py-0.5 text-[12px] font-semibold text-white">
          +{formatUSD(net)} saved
        </span>
      </div>
      <ChartContainer config={config} className="aspect-auto h-[120px] w-full">
        <BarChart accessibilityLayer data={data} margin={{ top: 12, right: 4, left: 4, bottom: 0 }} barCategoryGap="28%">
          <XAxis dataKey="k" tickLine={false} axisLine={false} dy={8} tick={{ fill: "var(--chart-tick)", fontSize: 11 }} />
          <YAxis hide />
          <ChartTooltip
            cursor={{ fill: "var(--chart-cursor)", fillOpacity: 0.6 }}
            content={<ChartTooltipContent className="bg-card" formatter={(value) => formatUSD(Number(value))} />}
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
