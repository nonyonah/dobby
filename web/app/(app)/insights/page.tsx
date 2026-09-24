"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Line, LineChart, ReferenceArea, XAxis, YAxis } from "recharts";
import { MoneyStats } from "@/components/money-stats";
import { CashflowViz } from "@/components/cashflow-viz";
import { SpendingSection, IncomeSection } from "@/components/flow-sections";
import { Meter } from "@/components/module-card";
import { AlertIcon } from "@/components/icons";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { ExportMenu } from "@/components/export-menu";

import { formatUSD } from "@/lib/format";
import type { TxFull } from "@/lib/transactions";
import { useApi } from "@/hooks/use-api";
import { MONTH_LABELS, type DayRange } from "@/lib/insights-data";
import type { InsightsSummary } from "@/lib/cashflow";

type Section = "cashflow" | "spending" | "income" | "tax";




function CashflowSection({ year, summary }: { year: number; summary: InsightsSummary | null }) {
  const income = summary?.totals.income ?? 0;
  const expenses = summary?.totals.expenses ?? 0;
  const netDelta = null;
  const expenseDelta = null;
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
      <CashflowViz
        year={year}
        sources={summary?.incomeAndSpendingBySource ?? []}
        categories={summary?.spendingByCategory ?? []}
        monthly={summary?.monthly ?? []}
        monthlyCategories={summary?.monthlySpendingByCategory ?? []}
      />
    </div>
  );
}

export default function InsightsPage() {
  const [section, setSection] = useState<Section>("cashflow");
  const [range, setRange] = useState<DayRange>(() => {
    const now = new Date();
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999) };
  });
  const [jurisdiction, setJurisdiction] = useState("nigeria");
  const [yearSummary, setYearSummary] = useState<InsightsSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryRetry, setSummaryRetry] = useState(0);
  const [taxEstimate, setTaxEstimate] = useState<{ estimatedTaxOwed: number; filingDeadline: string; quarterly?: { required: boolean; nextPayment: number; nextDueDate: string | null }; notes: string[] } | null>(null);
  const [taxChecklist, setTaxChecklist] = useState<Array<{ key: string; label: string; status: "READY" | "OUTSTANDING" }> | null>(null);
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();
  const selectedYear = range.from.getFullYear();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    void Promise.all([
      api.get<{ data: typeof taxEstimate }>("/v1/tax/estimate"),
      api.get<{ data: { items: Array<{ key: string; label: string; status: "READY" | "OUTSTANDING" }> } }>("/v1/tax/checklist"),
    ]).then(([estimate, checklist]) => {
      if (cancelled) return;
      setTaxEstimate(estimate.data);
      setTaxChecklist(checklist.data.items);
    }).catch(() => {
      if (cancelled) return;
      setTaxEstimate(null);
      setTaxChecklist([]);
    });
    const stored = window.localStorage.getItem("dobby-tax-jurisdiction");
    if (stored) setJurisdiction(stored);
    return () => { cancelled = true; };
  }, [api, isLoaded, isSignedIn]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    setSummaryLoading(true);
    setSummaryError(null);
    const from = new Date(selectedYear, 0, 1).toISOString();
    const to = new Date(selectedYear, 11, 31, 23, 59, 59, 999).toISOString();
    void api.get<{ data: InsightsSummary }>(`/v1/insights/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then((response) => {
      if (!cancelled) setYearSummary(response.data);
    }).catch((error: unknown) => {
      if (cancelled) return;
      setYearSummary(null);
      setSummaryError(error instanceof Error ? error.message : "Could not load annual Insights data.");
    }).finally(() => { if (!cancelled) setSummaryLoading(false); });
    return () => { cancelled = true; };
    // The API client is stable for the current Clerk session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, selectedYear, summaryRetry]);


  const taxConfig = useMemo(
    () => ({ v: { label: "Estimate", color: "#4a55c9" } }) satisfies ChartConfig,
    []
  );
  const taxData = useMemo(() => [], []);
  const taxNow = taxEstimate?.estimatedTaxOwed ?? 0;
  const taxThen = 0;
  const month = Math.max(0, Math.min(11, range.to.getMonth()));
  const setMonth = (m: number) => {
    const last = new Date(selectedYear, m + 1, 0).getDate();
    setRange({ from: new Date(selectedYear, m, 1), to: new Date(selectedYear, m, last, 23, 59, 59, 999) });
  };
  const toggleChecklist = async (key: string, status: "READY" | "OUTSTANDING") => {
    const next = status === "READY" ? "OUTSTANDING" : "READY";
    try { await api.patch(`/v1/tax/checklist/${key}`, { status: next }); } catch { return; }
    setTaxChecklist((current) => current?.map((item) => item.key === key ? { ...item, status: next } : item) ?? current);
  };
  const exportRows: TxFull[] = [];
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

        {summaryLoading && !yearSummary ? <div className="mb-4 rounded-lg border border-line bg-card px-4 py-3 text-[13px] text-muted-foreground" role="status">Loading this year’s transaction insights…</div> : null}
        {summaryError ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px]" role="alert">
            <span>Couldn’t load Insights data: {summaryError}</span>
            <button type="button" onClick={() => setSummaryRetry((current) => current + 1)} className="rounded-md px-3 py-1.5 font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">Try again</button>
          </div>
        ) : null}
        {section === "cashflow" ? (
          <CashflowSection year={selectedYear} summary={yearSummary} />
        ) : section === "spending" ? (
          <SpendingSection month={month} year={selectedYear} yearSummary={yearSummary} onMonthChange={setMonth} />
        ) : section === "income" ? (
          <IncomeSection month={month} year={selectedYear} yearSummary={yearSummary} onMonthChange={setMonth} />
        ) : (
          <div>
            <div className="grid grid-cols-1 items-start gap-x-8 gap-y-8 md:grid-cols-2">
              <section aria-label="Deductions">
                <h2 className="m-0 text-[13px] font-semibold">Deductions</h2>
                <ul className="m-0 mt-1 list-none p-0">
                  {([] as Array<{ id: string; name: string; detail: string; captured: number; cap: number }>).map((d) => {
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
                  {(taxChecklist ?? ["W-2 — Acme Retail", "1099-NEC — Northwind", "1099-INT — Mercury", "Charitable receipts", "Home office worksheet", "Prior-year return"].map((label, i) => ({ key: String(i), label, status: i !== 2 && i !== 3 ? "READY" as const : "OUTSTANDING" as const }))).map((item) => {
                    const label = item.label;
                    const ready = item.status === "READY";
                    return (
                      <li key={item.key} className="flex items-center gap-2 border-b border-line py-1.5 text-[13px] last:border-b-0">
                        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
                        <button type="button" onClick={() => toggleChecklist(item.key, item.status)} className={`inline-flex shrink-0 cursor-pointer items-center rounded-full border px-2 py-0.5 text-[12px] font-medium ${
                            ready
                              ? "border-success/40 bg-success-soft text-success"
                              : "border-warning/40 bg-warning-soft text-warning"
                          }`}
                        >
                          {ready ? "Ready" : "Outstanding"}
                        </button>
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
