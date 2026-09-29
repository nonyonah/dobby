"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";
import { formatUSD } from "@/lib/format";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "./ui/chart";
import { ModuleCard } from "./module-card";
import { Skeleton } from "./ui/skeleton";
import { useApi } from "@/hooks/use-api";

export function IncomeExpensesCard() {
  const [summary, setSummary] = useState<{ income: number; expenses: number; uncategorizedIncome?: number; uncategorizedExpenses?: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    void api.get<{ data: { totals: { income: number; expenses: number } } }>("/v1/insights/summary").then((response) => setSummary(response.data.totals)).catch(() => setSummary(null)).finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);
  const income = summary?.income ?? 0;
  const expenses = summary?.expenses ?? 0;
  const uncategorizedIncome = summary?.uncategorizedIncome ?? 0;
  const uncategorizedExpenses = summary?.uncategorizedExpenses ?? 0;
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

  if (!loaded) {
    return (
      <ModuleCard title="Income vs expenses" linkLabel="Transactions">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Skeleton className="h-3 w-14" /><Skeleton className="h-6 w-24" /></div>
          <div className="space-y-2"><Skeleton className="h-3 w-16" /><Skeleton className="h-6 w-24" /></div>
        </div>
        <Skeleton className="mt-3 h-5 w-36 rounded-full" />
        <Skeleton className="mt-3 h-[120px] w-full rounded-lg" />
      </ModuleCard>
    );
  }

  return (
    <ModuleCard title="Income vs expenses" linkLabel="Transactions">
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
      {uncategorizedIncome > 0 || uncategorizedExpenses > 0 ? (
        <p className="m-0 mt-2 text-[12px] leading-relaxed text-muted-foreground">
          Excluded from totals — <span className="mono tabular-nums text-foreground">{formatUSD(uncategorizedIncome)}</span> uncategorized
          inflow · <span className="mono tabular-nums text-foreground">{formatUSD(uncategorizedExpenses)}</span> uncategorized outflow.
          Categorize them in Transactions to count them.
        </p>
      ) : null}
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
