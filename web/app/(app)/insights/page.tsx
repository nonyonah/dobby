"use client";

import { useMemo, useState } from "react";
import { Line, LineChart, ReferenceArea, XAxis, YAxis } from "recharts";
import { MoneyStats } from "@/components/money-stats";
import { AiSummaries, Chip, type Summary } from "@/components/ai-summaries";
import { CashflowArea } from "@/components/cashflow-area";
import { Meter } from "@/components/module-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { CalendarIcon, MoneyIcon, StockDownIcon, StockUpIcon } from "@/components/icons";
import { AlertIcon } from "@/components/icons";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatUSD } from "@/lib/format";
import { TAX_DOCS } from "@/lib/finance";
import {
  ACCOUNTS,
  CATEGORY_SERIES,
  DATA_END,
  DATA_START,
  DEDUCTIONS_FULL,
  MONTH_LABELS,
  SOURCE_SERIES,
  TAX_TREND,
  YEAR,
  balanceAtDay,
  dayRangeLabel,
  monthsIn,
  pctChange,
  priorDayRange,
  sumDays,
  type DayRange,
} from "@/lib/insights-data";

type Section = "overview" | "tax";

const BASE_BALANCE = 200000;

function OverviewSection({
  range,
  income,
  expenses,
  balance,
  expenseDelta,
  balanceDelta,
  netDelta,
  incomeRows,
  expenseRows,
  customDates,
  onCustomDates,
}: {
  range: DayRange;
  income: number;
  expenses: number;
  balance: number;
  expenseDelta: number | null;
  balanceDelta: number | null;
  netDelta: number | null;
  incomeRows: { id: string; name: string; amount: number }[];
  expenseRows: { id: string; name: string; amount: number }[];
  customDates: Date[] | undefined;
  onCustomDates: (dates: Date[] | undefined) => void;
}) {
  const months = monthsIn(range.from, range.to);
  const burn = Math.round(expenses / Math.max(1, months.length));
  const balances = ACCOUNTS.reduce((s, a) => s + a.balance, 0);
  const topSource = incomeRows[0];
  const topCat = expenseRows[0];
  const summaries: Summary[] = [
    {
      title: "Runway and cash position",
      icon: <MoneyIcon />,
      body: (
        <>
          Net cash flow is <Chip>{income >= expenses ? "+" : "−"}{formatUSD(Math.abs(income - expenses))}</Chip>
          over the period. Balances total <Chip>{formatUSD(balances)}</Chip> with a
          monthly burn of <Chip>{formatUSD(burn)}/mo</Chip>.
        </>
      ),
    },
    {
      title: "Money in trends",
      icon: <StockUpIcon />,
      body: topSource ? (
        <>
          Money in reached <Chip>{formatUSD(income)}</Chip> with {topSource.name} contributing
          <Chip>{((topSource.amount / Math.max(1, income)) * 100).toFixed(1)}%</Chip> of total inflows.
        </>
      ) : (
        <>No inflows in the selected period.</>
      ),
    },
    {
      title: "Money out trends",
      icon: <StockDownIcon />,
      body: topCat ? (
        <>
          Spending was <Chip>{formatUSD(expenses)}</Chip>, led by {topCat.name} at
          <Chip>{formatUSD(topCat.amount)}</Chip> — keep an eye on it next month.
        </>
      ) : (
        <>No spending in the selected period.</>
      ),
    },
  ];

  return (
    <div>
      <MoneyStats
        stats={[
          { label: "Net income", value: income - expenses, delta: netDelta },
          { label: "Expenses", value: expenses, delta: expenseDelta, invert: true, minus: true },
          { label: "Cash balance", value: balance, delta: balanceDelta },
        ]}
      />
      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]" aria-live="polite">
          {dayRangeLabel(range.from, range.to)}, 2026
          {customDates && customDates.length > 0 ? ` · ${customDates.length} custom dates` : null}
        </p>
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="secondary" size="small">
                <CalendarIcon />
                Custom dates
              </Button>
            }
          />
          <PopoverContent align="end" className="w-auto p-2">
            <Calendar
              mode="multiple"
              selected={customDates}
              onSelect={onCustomDates}
              aria-label="Pick custom dates"
            />
          </PopoverContent>
        </Popover>
      </div>
      <div className="grid grid-cols-1 items-start gap-x-8 gap-y-8 lg:grid-cols-3">
        <AiSummaries items={summaries} />
        <div className="lg:col-span-2">
          <CashflowArea range={range} />
        </div>
      </div>
    </div>
  );
}

export default function InsightsPage() {
  const [section, setSection] = useState<Section>("overview");
  const [range, setRange] = useState<DayRange>({ from: new Date(2026, 6, 1), to: new Date(2026, 8, 30) });
  const [customDates, setCustomDates] = useState<Date[] | undefined>(undefined);

  const applyCustomDates = (dates: Date[] | undefined) => {
    setCustomDates(dates);
    if (!dates || dates.length === 0) return;
    const inYear = dates.filter((d) => d.getFullYear() === 2026);
    if (inYear.length === 0) return;
    const sorted = [...inYear].sort((a, b) => a.getTime() - b.getTime());
    const lo = sorted[0] < DATA_START ? DATA_START : sorted[0];
    const hi = sorted[sorted.length - 1] > DATA_END ? DATA_END : sorted[sorted.length - 1];
    if (hi < lo) return;
    setRange({ from: lo, to: hi });
  };

  const prior = priorDayRange(range.from, range.to);
  const incomeVals = YEAR.map((m) => m.income);
  const expenseVals = YEAR.map((m) => m.expenses);
  const income = sumDays(incomeVals, range.from, range.to);
  const expenses = sumDays(expenseVals, range.from, range.to);
  const expenseDelta = prior ? pctChange(expenses, sumDays(expenseVals, prior.from, prior.to)) : null;
  const netDelta = prior
    ? pctChange(
        income - expenses,
        sumDays(incomeVals, prior.from, prior.to) - sumDays(expenseVals, prior.from, prior.to)
      )
    : null;
  const balance = balanceAtDay(BASE_BALANCE, YEAR, range.to);
  const balanceDelta = prior ? pctChange(balance, balanceAtDay(BASE_BALANCE, YEAR, prior.to)) : null;

  const incomeRows = useMemo(() => {
    return SOURCE_SERIES.map((s) => ({ id: s.id, name: s.name, amount: Math.round(sumDays(s.monthly, range.from, range.to)) }))
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [range]);

  const expenseRows = useMemo(() => {
    return CATEGORY_SERIES.map((c) => ({ id: c.id, name: c.name, amount: Math.round(sumDays(c.monthly, range.from, range.to)) }))
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [range]);

  const taxConfig = useMemo(
    () => ({ v: { label: "Estimate", color: "#4a55c9" } }) satisfies ChartConfig,
    []
  );
  const taxData = useMemo(
    () => TAX_TREND.map((t) => ({ label: t.label, value: t.value })),
    []
  );
  const taxNow = TAX_TREND[Math.min(11, range.to.getMonth())].value;
  const taxThen = range.from.getMonth() > 0 ? TAX_TREND[range.from.getMonth() - 1].value : 0;

  return (
    <>
      <div className="w-full px-6 pt-6 pb-10">
        <div className="mb-5 inline-flex items-center gap-1 rounded-full bg-[#f1efeb] dark:bg-[#26262a] p-0.5" role="group" aria-label="Insights section">
          {(["overview", "tax"] as Section[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              aria-pressed={section === s}
              className={`h-[26px] w-24 cursor-pointer rounded-full px-3 text-[12px] font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-[#4a55c9] ${
                section === s ? "bg-white dark:bg-[#3a3a40] text-[#1c1d20] dark:text-white shadow-sm" : "text-[#8a8b91] dark:text-[#a2a3a8] hover:text-[#1c1d20] dark:hover:text-white"
              }`}
            >
              {s === "overview" ? "Overview" : "Tax"}
            </button>
          ))}
        </div>

        {section === "overview" ? (
          <OverviewSection
            range={range}
            income={income}
            expenses={expenses}
            balance={balance}
            netDelta={netDelta}
            expenseDelta={expenseDelta}
            balanceDelta={balanceDelta}
            incomeRows={incomeRows}
            expenseRows={expenseRows}
            customDates={customDates}
            onCustomDates={applyCustomDates}
          />
        ) : (
          <div>
            <div className="grid grid-cols-1 items-start gap-x-8 gap-y-8 md:grid-cols-2">
              <section aria-label="Deductions">
                <h2 className="m-0 text-[13px] font-semibold">Deductions</h2>
                <ul className="m-0 mt-1 list-none p-0">
                  {DEDUCTIONS_FULL.map((d) => {
                    const pct = d.cap > 0 ? Math.min(100, (d.captured / d.cap) * 100) : 0;
                    const done = d.captured >= d.cap;
                    return (
                      <li key={d.id} className="border-b border-[#f1efeb] dark:border-[#26262a] py-2 last:border-b-0">
                        <div className="flex items-center gap-2 text-[13px]">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{d.name}</span>
                            <span className="block truncate text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">{d.detail}</span>
                          </span>
                          <span className="mono shrink-0 text-right">
                            <span className="block font-medium tabular-nums">{formatUSD(d.captured)}</span>
                            <span className="block text-[12px] text-[#8a8b91] dark:text-[#a2a3a8] tabular-nums">{pct.toFixed(0)}% of cap</span>
                          </span>
                        </div>
                        <div className="mt-1.5">
                          <Meter value={pct} tone={done ? "green" : "accent"} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section aria-label="Tax position">
                <h2 className="m-0 text-[13px] font-semibold">Tax position</h2>
                <p className="mono m-0 mt-1 text-[20px] font-semibold tracking-[-0.02em] tabular-nums">
                  {formatUSD(taxNow)}
                </p>
                <p className="m-0 text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">
                  Running estimate · +{formatUSD(taxNow - taxThen)} in selected period
                </p>
                <ChartContainer config={taxConfig} className="aspect-auto h-[72px] w-full">
                  <LineChart accessibilityLayer data={taxData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                    <XAxis dataKey="label" hide />
                    <YAxis hide domain={["auto", "auto"]} />
                    <ChartTooltip
                      cursor={{ stroke: "#4a55c9", strokeOpacity: 0.35, strokeDasharray: "3 3" }}
                      content={<ChartTooltipContent className="bg-white dark:bg-[#1a1a1d]" formatter={(v) => formatUSD(Number(v))} />}
                    />
                    <ReferenceArea
                      x1={MONTH_LABELS[range.from.getMonth()]}
                      x2={MONTH_LABELS[range.to.getMonth()]}
                      fill="#4a55c9"
                      fillOpacity={0.08}
                      stroke="none"
                    />
                    <Line dataKey="value" type="monotone" stroke="#4a55c9" strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: "#4a55c9", stroke: "#fff", strokeWidth: 2 }} />
                  </LineChart>
                </ChartContainer>
                <p className="m-0 mt-2 text-[13px] leading-relaxed">
                  At the current pace you&apos;re setting aside roughly
                  <span className="mono mx-1 rounded bg-[#f1efeb] dark:bg-[#26262a] px-1.5 py-px text-[12px] font-medium tabular-nums">{formatUSD(Math.round(taxNow / 9))}/mo</span>
                  toward an $18,240 annual estimate.
                </p>
              </section>
            </div>

            <div className="mt-8 grid grid-cols-1 items-start gap-x-8 gap-y-8 md:grid-cols-2">
              <section aria-label="Filing checklist">
                <h2 className="m-0 text-[13px] font-semibold">Filing checklist</h2>
                <ul className="m-0 mt-1 list-none p-0">
                  {["W-2 — Acme Retail", "1099-NEC — Northwind", "1099-INT — Mercury", "Charitable receipts", "Home office worksheet", "Prior-year return"].map((label, i) => {
                    const ready = i !== 2 && i !== 3;
                    return (
                      <li key={label} className="flex items-center gap-2 border-b border-[#f1efeb] dark:border-[#26262a] py-1.5 text-[13px] last:border-b-0">
                        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[12px] font-medium ${
                            ready
                              ? "border-[#cfe3d5] bg-[#e4efe7] text-[#35754e] dark:border-[#047857] dark:bg-[#064e3b] dark:text-[#6ee7b7]"
                              : "border-[#ecdfc2] bg-[#f6ecd6] text-[#ad7f22] dark:border-[#B45309] dark:bg-[#451a03] dark:text-[#fcd34d]"
                          }`}
                        >
                          {ready ? "Ready" : "Outstanding"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>

            <p className="m-0 mt-8 flex items-start gap-2 rounded-[10px] border border-[#ecdfc2] bg-[#f6ecd6] px-3 py-2.5 text-[12px] leading-relaxed text-[#8a5a00] dark:border-[#B45309] dark:bg-[#451a03] dark:text-[#fcd34d]">
              <AlertIcon className="mt-0.5 shrink-0" />
              General guidance only — figures are estimates from your tracked data and nothing here is filed on your behalf.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
