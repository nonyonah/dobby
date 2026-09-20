"use client";

import { useEffect, useMemo, useState } from "react";
import { Line, LineChart, ReferenceArea, XAxis, YAxis } from "recharts";
import { MoneyStats } from "@/components/money-stats";
import { CashflowViz } from "@/components/cashflow-viz";
import { SpendingSection, IncomeSection } from "@/components/flow-sections";
import { Meter } from "@/components/module-card";
import { AlertIcon } from "@/components/icons";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { ExportMenu } from "@/components/export-menu";
import { TRANSACTIONS_FULL } from "@/lib/transactions";
import { formatUSD } from "@/lib/format";
import {
  DEDUCTIONS_FULL,
  MONTH_LABELS,
  TAX_TREND,
  YEAR,
  pctChange,
  priorDayRange,
  sumDays,
  type DayRange,
} from "@/lib/insights-data";

type Section = "cashflow" | "spending" | "income" | "tax";




function CashflowSection({
  month,
  income,
  expenses,
  netDelta,
  expenseDelta,
}: {
  month: number;
  income: number;
  expenses: number;
  netDelta: number | null;
  expenseDelta: number | null;
}) {
  const net = income - expenses;
  const rate = income > 0 ? (net / income) * 100 : 0;

  return (
    <div className="flex flex-col gap-8">
      <MoneyStats
        stats={[
          { label: "Total income", value: income, delta: null },
          { label: "Total spend", value: expenses, delta: expenseDelta, invert: true, minus: true },
          { label: "Total net income", value: net, delta: netDelta },
          { label: "Saving rate", value: rate, delta: null, format: (n) => `${n.toFixed(0)}%` },
        ]}
      />
      <CashflowViz month={month} />
    </div>
  );
}

export default function InsightsPage() {
  const [section, setSection] = useState<Section>("cashflow");
  const [range, setRange] = useState<DayRange>({ from: new Date(2026, 8, 1), to: new Date(2026, 8, 30) });
  const [jurisdiction, setJurisdiction] = useState("nigeria");

  useEffect(() => {
    const stored = window.localStorage.getItem("dobby-tax-jurisdiction");
    // Browser preference is read after hydration to keep server markup stable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setJurisdiction(stored);
  }, []);


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
  const month = Math.max(0, Math.min(8, range.to.getMonth()));
  const setMonth = (m: number) => {
    const last = new Date(2026, m + 1, 0).getDate();
    setRange({ from: new Date(2026, m, 1), to: new Date(2026, m, Math.min(last, m === 8 ? 30 : last)) });
  };
  const exportRows = TRANSACTIONS_FULL.filter((transaction) => {
    const monthPrefix = `2026-${String(month + 1).padStart(2, "0")}`;
    return transaction.date.startsWith(monthPrefix) && (section === "cashflow" ? true : section === "income" ? transaction.amount >= 0 : transaction.amount < 0);
  });
  const exportFilename = section === "cashflow" ? "dobby-cashflow" : section === "income" ? "dobby-income" : "dobby-spending";

  return (
    <>
      <div className="w-full px-6 pt-6 pb-10">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center rounded-full border border-line/60 bg-secondary p-1" role="group" aria-label="Insights section">
          {(["cashflow", "spending", "income", "tax"] as Section[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              aria-pressed={section === s}
              className={`h-8 cursor-pointer rounded-full px-4 text-[12px] font-medium capitalize transition-colors outline-none focus-visible:outline-2 focus-visible:outline-ring ${
                section === s ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
          </div>
          {section !== "tax" ? <ExportMenu rows={exportRows} filename={exportFilename} /> : null}
        </div>

        {section === "cashflow" ? (
          <CashflowSection
            month={month}
            income={income}
            expenses={expenses}
            netDelta={netDelta}
            expenseDelta={expenseDelta}
          />
        ) : section === "spending" ? (
          <SpendingSection month={month} onMonthChange={setMonth} />
        ) : section === "income" ? (
          <IncomeSection month={month} onMonthChange={setMonth} />
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

            <div role="alert" className="m-0 mt-8 flex items-start gap-3 rounded-2xl border border-line bg-card px-4 py-3 text-[12px] leading-relaxed text-card-foreground">
              <AlertIcon className="mt-0.5 shrink-0 text-warning" />
              <span>General guidance only — figures are estimates from your tracked data and nothing here is filed on your behalf.</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
