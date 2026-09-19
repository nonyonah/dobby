"use client";

import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { formatUSD } from "@/lib/format";
import { MONTH_LABELS, monthOverlap, YEAR, type DayRange } from "@/lib/insights-data";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "./ui/chart";

/**
 * Dual-area money in / money out chart across the selected period
 * (edge months prorated to the exact day range).
 */
export function CashflowArea({ range }: { range: DayRange }) {
  const config = useMemo(
    () =>
      ({
        income: { label: "Money in", color: "#22C55E" },
        expenses: { label: "Money out", color: "#F04438" },
      }) satisfies ChartConfig,
    []
  );
  const data = useMemo(() => {
    const out: { label: string; income: number; expenses: number }[] = [];
    for (let m = 0; m < 12; m++) {
      const f = monthOverlap(m, range.from, range.to);
      if (f <= 0) continue;
      out.push({
        label: MONTH_LABELS[m],
        income: Math.round(YEAR[m].income * f),
        expenses: Math.round(YEAR[m].expenses * f),
      });
    }
    return out;
  }, [range]);

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-4 text-[12px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 rounded-full bg-[#22C55E]" /> Money in
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 rounded-full bg-[#F04438]" /> Money out
        </span>
      </div>
      <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
        <AreaChart accessibilityLayer data={data} margin={{ top: 12, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="riftCashIn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--color-income)" stopOpacity={0.22} />
              <stop offset="1" stopColor="var(--color-income)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="riftCashOut" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--color-expenses)" stopOpacity={0.22} />
              <stop offset="1" stopColor="var(--color-expenses)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} dy={8} tick={{ fill: "var(--chart-tick)", fontSize: 11 }} />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--chart-tick)", fontSize: 11 }}
            tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`)}
          />
          <ChartTooltip
            cursor={{ stroke: "var(--chart-tick)", strokeOpacity: 0.35, strokeDasharray: "3 3" }}
            content={<ChartTooltipContent className="bg-card" formatter={(v) => formatUSD(Number(v))} />}
          />
          <Area dataKey="income" type="monotone" stroke="var(--color-income)" strokeWidth={2} fill="url(#riftCashIn)" dot={false} activeDot={{ r: 3.5, fill: "var(--color-income)", stroke: "var(--card)", strokeWidth: 2 }} />
          <Area dataKey="expenses" type="monotone" stroke="var(--color-expenses)" strokeWidth={2} fill="url(#riftCashOut)" dot={false} activeDot={{ r: 3.5, fill: "var(--color-expenses)", stroke: "var(--card)", strokeWidth: 2 }} />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
