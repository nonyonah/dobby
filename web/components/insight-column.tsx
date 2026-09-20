"use client";

import { useMemo } from "react";
import { Line, LineChart, ReferenceArea, XAxis, YAxis } from "recharts";
import { formatUSD } from "@/lib/format";
import { MONTH_LABELS, type Range } from "@/lib/insights-data";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "./ui/chart";
import { Meter } from "./module-card";

export interface BreakdownRow {
  id: string;
  name: string;
  amount: number;
  dot?: string;
}

interface InsightColumnProps {
  title: string;
  headline: number;
  /** signed % vs prior period; null hides the pill */
  delta: number | null;
  /** when true, a negative delta is good (expenses) */
  invertTone?: boolean;
  /** full-year monthly values for the sparkline */
  spark: number[];
  color: string;
  range: Range;
  rows: BreakdownRow[];
  children?: React.ReactNode;
}

/**
 * Reusable insight column: headline + vs-prior pill, full-year sparkline
 * with the selected window shaded, ranked breakdown with thin bars.
 * Shared by Overview and Tax sections.
 */
export function InsightColumn({
  title,
  headline,
  delta,
  invertTone = false,
  spark,
  color,
  range,
  rows,
  children,
}: InsightColumnProps) {
  const config = useMemo(
    () => ({ v: { label: title, color } }) satisfies ChartConfig,
    [title, color]
  );
  const data = useMemo(
    () => spark.map((value, i) => ({ label: MONTH_LABELS[i], value })),
    [spark]
  );
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const good = delta === null ? true : invertTone ? delta <= 0 : delta >= 0;
  const up = (delta ?? 0) >= 0;

  return (
    <section aria-label={title}>
      <h2 className="m-0 text-[13px] font-semibold text-foreground">{title}</h2>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <p className="mono m-0 text-[20px] font-semibold tracking-[-0.02em] tabular-nums">
          {formatUSD(headline)}
        </p>
        {delta !== null ? (
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[12px] font-medium tabular-nums ${
              good
                ? "border-transparent bg-[#00afb9] text-white"
                : "border-transparent bg-[#ef476f] text-white"
            }`}
          >
            {up ? "+" : "−"}{Math.abs(delta).toFixed(1)}%
          </span>
        ) : null}
      </div>

      <ChartContainer config={config} className="aspect-auto h-[72px] w-full">
        <LineChart accessibilityLayer data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey="label" hide />
          <YAxis hide domain={["auto", "auto"]} />
          <ChartTooltip
            cursor={{ stroke: color, strokeOpacity: 0.35, strokeDasharray: "3 3" }}
            content={<ChartTooltipContent className="bg-card" formatter={(v) => formatUSD(Number(v))} />}
          />
          <ReferenceArea
            x1={MONTH_LABELS[range.start]}
            x2={MONTH_LABELS[range.end]}
            fill={color}
            fillOpacity={0.08}
            stroke="none"
          />
          <Line dataKey="value" type="monotone" stroke={color} strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: color, stroke: "var(--card)", strokeWidth: 2 }} />
        </LineChart>
      </ChartContainer>

      <table className="mt-1 w-full border-collapse text-[13px]">
        <tbody>
          {rows.map((r) => {
            const pct = total > 0 ? (r.amount / total) * 100 : 0;
            return (
              <tr key={r.id} className="border-b border-line last:border-b-0">
                <td className="py-1.5 pr-2">
                  <span className="flex items-center gap-1.5">
                    {r.dot ? (
                      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: r.dot }} />
                    ) : null}
                    <span className="truncate font-medium">{r.name}</span>
                  </span>
                </td>
                <td className="py-1.5 pr-2 whitespace-nowrap">
                  <span className="flex items-center gap-1.5">
                    <span className="mono text-[12px] text-muted-foreground tabular-nums">{pct.toFixed(0)}%</span>
                    <span className="w-16">
                      <Meter value={pct} tone="accent" />
                    </span>
                  </span>
                </td>
                <td className="mono py-1.5 text-right font-medium tabular-nums">
                  {formatUSD(r.amount)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {children}
    </section>
  );
}
