"use client";

import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { CalendarIcon, FilterIcon } from "./icons";
import { formatUSD } from "@/lib/format";
import { MONTH_LABELS } from "@/lib/insights-data";
import { ChartContainer, type ChartConfig } from "./ui/chart";
import { Card } from "./ui/card";


export interface BreakdownItem {
  id: string;
  name: string;
  amount: number;
  color: string;
}

interface BreakdownPieProps {
  title: string;

  items: BreakdownItem[];
  month: number;
  year: number;
  months: { value: number; label: string }[];
  onMonthChange: (month: number) => void;
}

/** Breakdown card with aligned controls, a larger donut, and category detail. */
export function BreakdownPie({ title, items, month, year, months, onMonthChange }: BreakdownPieProps) {
  const [catFilter, setCatFilter] = useState("all");
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const config = useMemo(
    () => ({ v: { label: title, color: "#4a55c9" } }) satisfies ChartConfig,
    [title]
  );
  const visible = catFilter === "all" ? items : items.filter((item) => item.id === catFilter);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const monthLabel = MONTH_LABELS[month] ?? "Month";
  const dateLabel = `${monthLabel} 1, ${year} - ${monthLabel} ${lastDay}, ${year}`;

  return (
    <Card className="gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{title}</h2>
          <p className="m-0 mt-1 text-sm font-bold text-foreground">{dateLabel}</p>
        </div>
        <div className="flex flex-nowrap items-center justify-end gap-2">
          <Select className="w-auto shrink-0" value={catFilter} onValueChange={(value) => setCatFilter(value ?? "all")}>
            <SelectTrigger aria-label="Filter by category" className="h-8 w-36 text-[12px]">
              <FilterIcon />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {items.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select className="w-auto shrink-0" value={String(month)} onValueChange={(value) => onMonthChange(Number(value))}>
            <SelectTrigger aria-label="Filter by month" className="h-8 w-28 text-[12px]">
              <CalendarIcon />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((item) => <SelectItem key={item.value} value={String(item.value)}>{item.label}</SelectItem>)}
            </SelectContent>
          </Select>

        </div>
      </div>

      <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[300px_minmax(0,1fr)]">
        <div className="relative mx-auto w-full max-w-[300px]">
          <ChartContainer config={config} className="aspect-square h-auto w-full">
            <PieChart>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0];
                  return (
                    <div className="rounded-lg border border-line bg-card px-3 py-2 text-xs text-card-foreground shadow-md">
                      <p className="m-0 font-semibold">{String(point.name ?? "Category")}</p>
                      <p className="mono m-0 mt-0.5 tabular-nums text-muted-foreground">{formatUSD(Number(point.value))}</p>
                    </div>
                  );
                }}
              />
              <Pie data={items} dataKey="amount" nameKey="name" innerRadius={84} outerRadius={124} paddingAngle={2} cornerRadius={5} strokeWidth={0}>
                {items.map((item) => (
                  <Cell key={item.id} fill={item.color} opacity={catFilter === "all" || catFilter === item.id ? 1 : 0.25} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
            <span className="mono text-xl font-semibold tabular-nums">{formatUSD(total)}</span>
            <span className="text-[11px] text-muted-foreground">{monthLabel}</span>
          </div>
        </div>

        <ul className="m-0 grid list-none grid-cols-1 gap-x-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => {
            const pct = total > 0 ? (item.amount / total) * 100 : 0;
            return (
              <li key={item.id} className="flex items-center gap-2 border-b border-line py-2">
                <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{item.name}</span>
                <span className="mono shrink-0 text-[13px] font-medium tabular-nums">{formatUSD(item.amount)}</span>
                <span className="mono w-11 shrink-0 text-right text-[12px] text-muted-foreground tabular-nums">{pct.toFixed(0)}%</span>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
