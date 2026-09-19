"use client";

import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "./ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { formatUSD } from "@/lib/format";
import { MONTH_LABELS, monthOverlap, type DayRange } from "@/lib/insights-data";

const config = { netWorth: { label: "Net worth", color: "#4a55c9" } } satisfies ChartConfig;

export function NetWorthSection({ range }: { range: DayRange }) {
  const assets = 248640;
  const liabilities = 18420;
  const netWorth = assets - liabilities;
  const data = useMemo(() => MONTH_LABELS.map((label, index) => ({ label, netWorth: Math.round((netWorth - 9200 + index * 1200) * Math.max(0, monthOverlap(index, range.from, range.to))) })).filter((_, index) => monthOverlap(index, range.from, range.to) > 0), [range, netWorth]);

  return <Card className="mt-8">
    <CardHeader><CardTitle>Net worth</CardTitle><CardDescription>Bank, card, and stablecoin wallet balances across the selected timeline.</CardDescription></CardHeader>
    <CardContent>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div><p className="m-0 text-[12px] text-muted-foreground">Net worth</p><p className="mono m-0 mt-1 text-[18px] font-semibold tabular-nums">{formatUSD(netWorth)}</p></div>
        <div><p className="m-0 text-[12px] text-muted-foreground">Assets</p><p className="mono m-0 mt-1 text-[13px] font-medium tabular-nums">{formatUSD(assets)}</p></div>
        <div><p className="m-0 text-[12px] text-muted-foreground">Liabilities</p><p className="mono m-0 mt-1 text-[13px] font-medium tabular-nums">{formatUSD(liabilities)}</p></div>
      </div>
      <ChartContainer config={config} className="aspect-auto h-[190px] w-full" aria-label="Net worth trend chart">
        <AreaChart accessibilityLayer data={data} margin={{ top: 12, right: 4, left: 4, bottom: 0 }}>
          <defs><linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--color-netWorth)" stopOpacity={0.2} /><stop offset="1" stopColor="var(--color-netWorth)" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--chart-tick)", fontSize: 11 }} />
          <YAxis hide />
          <ChartTooltip content={<ChartTooltipContent className="bg-popover" formatter={(value) => formatUSD(Number(value))} />} />
          <Area dataKey="netWorth" type="monotone" stroke="var(--color-netWorth)" strokeWidth={2} fill="url(#netWorthFill)" dot={false} />
        </AreaChart>
      </ChartContainer>
      <table className="sr-only"><caption>Net worth trend data</caption><thead><tr><th scope="col">Month</th><th scope="col">Net worth</th></tr></thead><tbody>{data.map((item) => <tr key={item.label}><td>{item.label}</td><td>{formatUSD(item.netWorth)}</td></tr>)}</tbody></table>
    </CardContent>
  </Card>;
}
