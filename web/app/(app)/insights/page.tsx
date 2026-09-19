"use client";

import { useEffect, useMemo, useState } from "react";
import { DateField, DateRangePicker, Label, RangeCalendar } from "@heroui/react";
import { fromDate, parseDate } from "@internationalized/date";
import { Line, LineChart, ReferenceArea, XAxis, YAxis } from "recharts";
import { MoneyStats } from "@/components/money-stats";
import { AiSummaries, Chip, type Summary } from "@/components/ai-summaries";
import { CashflowArea } from "@/components/cashflow-area";
import { Meter } from "@/components/module-card";
import { MoneyIcon, StockDownIcon, StockUpIcon } from "@/components/icons";
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
type DateRangeChange = Parameters<NonNullable<React.ComponentProps<typeof DateRangePicker>["onChange"]>>[0];


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

}) {
  const months = monthsIn(range.from, range.to);
  const burn = Math.round(expenses / Math.max(1, months.length));
  const balances = ACCOUNTS.reduce((s, a) => s + a.balance, 0);
  const topSource = incomeRows[0];
  const topCat = expenseRows[0];
  const summaries: Summary[] = [
    { title: "Runway and cash position", icon: <MoneyIcon />, body: <>Net cash flow is <Chip>{income >= expenses ? "+" : "−"}{formatUSD(Math.abs(income - expenses))}</Chip> over the period. Balances total <Chip>{formatUSD(balances)}</Chip> with a monthly burn of <Chip>{formatUSD(burn)}/mo</Chip>.</> },
    { title: "Money in trends", icon: <StockUpIcon />, body: topSource ? <>Money in reached <Chip>{formatUSD(income)}</Chip> with {topSource.name} contributing <Chip>{((topSource.amount / Math.max(1, income)) * 100).toFixed(1)}%</Chip> of total inflows.</> : <>No inflows in the selected period.</> },
    { title: "Money out trends", icon: <StockDownIcon />, body: topCat ? <>Spending was <Chip>{formatUSD(expenses)}</Chip>, led by {topCat.name} at <Chip>{formatUSD(topCat.amount)}</Chip> — keep an eye on it next month.</> : <>No spending in the selected period.</> },
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
  const [jurisdiction, setJurisdiction] = useState("nigeria");

  useEffect(() => {
    const stored = window.localStorage.getItem("dobby-tax-jurisdiction");
    // Browser preference is read after hydration to keep server markup stable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setJurisdiction(stored);
  }, []);

  const applyDateRange = (dates: DateRangeChange) => {
    if (!dates) return;
    const from = dates.start.toDate("UTC");
    const to = dates.end.toDate("UTC");
    setCustomDates([from, to]);
    setRange({
      from: from < DATA_START ? DATA_START : from,
      to: to > DATA_END ? DATA_END : to,
    });
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


  const incomeRows = useMemo(() => SOURCE_SERIES.map((s) => ({ id: s.id, name: s.name, amount: Math.round(sumDays(s.monthly, range.from, range.to)) })).filter((r) => r.amount > 0).sort((a, b) => b.amount - a.amount), [range]);
  const expenseRows = useMemo(() => CATEGORY_SERIES.map((c) => ({ id: c.id, name: c.name, amount: Math.round(sumDays(c.monthly, range.from, range.to)) })).filter((r) => r.amount > 0).sort((a, b) => b.amount - a.amount), [range]);

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
        <div className="mb-5 inline-flex w-56 items-center rounded-full border border-line/60 bg-secondary p-1" role="group" aria-label="Insights section">
          {(["overview", "tax"] as Section[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              aria-pressed={section === s}
              className={`h-8 w-1/2 cursor-pointer rounded-full px-3 text-[12px] font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-ring ${
                section === s ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "overview" ? "Overview" : "Tax"}
            </button>
          ))}
        </div>

        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <p className="m-0 text-[12px] text-muted-foreground" aria-live="polite">
            {dayRangeLabel(range.from, range.to)}, 2026
            {customDates ? " · custom range" : null}
          </p>
          <DateRangePicker
            aria-label="Select insights date range"
            granularity="day"
            value={{ start: fromDate(range.from, "UTC"), end: fromDate(range.to, "UTC") }}
            onChange={applyDateRange}
            className="w-fit"
          >
            <Label className="sr-only">Date range</Label>
            <DateField.Group className="min-h-8 w-fit overflow-visible rounded-lg border border-line bg-card px-2 text-[12px] text-foreground">
              <DateField.InputContainer className="min-w-0 flex-1">
                <DateField.Input slot="start">{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
                <DateRangePicker.RangeSeparator />
                <DateField.Input slot="end">{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
              </DateField.InputContainer>
              <DateField.Suffix><DateRangePicker.Trigger aria-label="Open date range calendar" className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"><DateRangePicker.TriggerIndicator /></DateRangePicker.Trigger></DateField.Suffix>
            </DateField.Group>
            <DateRangePicker.Popover placement="bottom end" className="z-[60] rounded-xl border border-line bg-card p-3 text-foreground shadow-lg">
              <RangeCalendar className="rounded-lg bg-card p-2 text-foreground [&_button]:text-foreground [&_button:hover]:bg-secondary [&_[aria-selected=true]]:bg-primary [&_[aria-selected=true]]:text-primary-foreground" aria-label="Select insights date range" minValue={parseDate("2026-01-01")} maxValue={parseDate("2026-12-31")}>
                <RangeCalendar.Header>
                  <RangeCalendar.Heading />
                  <RangeCalendar.NavButton slot="previous" />
                  <RangeCalendar.NavButton slot="next" />
                </RangeCalendar.Header>
                <RangeCalendar.Grid>
                  <RangeCalendar.GridHeader>{(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}</RangeCalendar.GridHeader>
                  <RangeCalendar.GridBody>{(date) => <RangeCalendar.Cell date={date} />}</RangeCalendar.GridBody>
                </RangeCalendar.Grid>
              </RangeCalendar>
            </DateRangePicker.Popover>
          </DateRangePicker>
        </div>

        {section === "overview" ? (
          <OverviewSection
            range={range}
            income={income}
            expenses={expenses}
            balance={balance}
            netDelta={netDelta}
            incomeRows={incomeRows}
            expenseRows={expenseRows}
            expenseDelta={expenseDelta}
            balanceDelta={balanceDelta}
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
                      <li key={d.id} className="border-b border-line py-2 last:border-b-0">
                        <div className="flex items-center gap-2 text-[13px]">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{d.name}</span>
                            <span className="block truncate text-[12px] text-muted-foreground">{d.detail}</span>
                          </span>
                          <span className="mono shrink-0 text-right">
                            <span className="block font-medium tabular-nums">{formatUSD(d.captured)}</span>
                            <span className="block text-[12px] text-muted-foreground tabular-nums">{pct.toFixed(0)}% of cap</span>
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
                                <p className="m-0 mt-1 text-[12px] text-muted-foreground">Using {jurisdiction === "nigeria" ? "Nigeria" : jurisdiction === "united-kingdom" ? "United Kingdom" : "United States"} deduction rules</p>
                <p className="mono m-0 mt-1 text-[20px] font-semibold tracking-[-0.02em] tabular-nums">
                  {formatUSD(taxNow)}
                </p>
                <p className="m-0 text-[12px] text-muted-foreground">
                  Running estimate · +{formatUSD(taxNow - taxThen)} in selected period
                </p>
                <ChartContainer config={taxConfig} className="aspect-auto h-[72px] w-full">
                  <LineChart accessibilityLayer data={taxData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                    <XAxis dataKey="label" hide />
                    <YAxis hide domain={["auto", "auto"]} />
                    <ChartTooltip
                      cursor={{ stroke: "#4a55c9", strokeOpacity: 0.35, strokeDasharray: "3 3" }}
                      content={<ChartTooltipContent className="bg-card" formatter={(v) => formatUSD(Number(v))} />}
                    />
                    <ReferenceArea
                      x1={MONTH_LABELS[range.from.getMonth()]}
                      x2={MONTH_LABELS[range.to.getMonth()]}
                      fill="#4a55c9"
                      fillOpacity={0.08}
                      stroke="none"
                    />
                    <Line dataKey="value" type="monotone" stroke="#4a55c9" strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: "#4a55c9", stroke: "var(--card)", strokeWidth: 2 }} />
                  </LineChart>
                </ChartContainer>
                <p className="m-0 mt-2 text-[13px] leading-relaxed">
                  At the current pace you&apos;re setting aside roughly
                  <span className="mono mx-1 rounded bg-secondary px-1.5 py-px text-[12px] font-medium tabular-nums">{formatUSD(Math.round(taxNow / 9))}/mo</span>
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
                      <li key={label} className="flex items-center gap-2 border-b border-line py-1.5 text-[13px] last:border-b-0">
                        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[12px] font-medium ${
                            ready
                              ? "border-success/40 bg-success-soft text-success"
                              : "border-warning/40 bg-warning-soft text-warning"
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

            <p className="m-0 mt-8 flex items-start gap-2 rounded-[10px] border border-warning/40 bg-warning-soft px-3 py-2.5 text-[12px] leading-relaxed text-warning">
              <AlertIcon className="mt-0.5 shrink-0" />
              General guidance only — figures are estimates from your tracked data and nothing here is filed on your behalf.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
