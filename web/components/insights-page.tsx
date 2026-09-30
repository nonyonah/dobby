"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { MoneyStats } from "@/components/money-stats";
import { CashflowViz } from "@/components/cashflow-viz";
import { SpendingSection, IncomeSection } from "@/components/flow-sections";
import { Meter } from "@/components/module-card";
import { AlertIcon } from "@/components/icons";
import { ExportMenu } from "@/components/export-menu";
import { StablecoinSection, isStablecoinAsset } from "@/components/stablecoin-section";
import { toast } from "@/components/ui/toast";

import { formatCurrency } from "@/lib/format";
import type { TxFull } from "@/lib/transactions";
import { useApi } from "@/hooks/use-api";
import { AGGREGATE_TIMEOUT_MS } from "@/lib/api-client";
import { type DayRange } from "@/lib/insights-data";
import type { InsightsSummary } from "@/lib/cashflow";
import { guidanceFor, guidanceText } from "@/lib/error-guidance";
import { TAX_JURISDICTIONS } from "@/lib/countries";
import { TaxPlanningCard } from "@/components/tax-planning-card";
import { Alert, AlertContent, AlertDescription, AlertIndicator } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";

type Section = "cashflow" | "spending" | "income" | "stablecoin" | "tax";

/** Shape of one row from `GET /v1/transactions`, as used for export. */
type ApiYearTx = {
  id: string;
  type: "INCOME" | "EXPENSE";
  amount: number | string;
  displayAmount?: number | string | null;
  description: string;
  merchant?: string | null;
  occurredAt: string;
  source?: string | null;
  assetSymbol?: string | null;
  isTaxable: boolean;
  needsReview: boolean;
  account?: { name: string } | null;
  category?: { id: string; name: string } | null;
};

/** Stable identity so loading renders never re-trigger the export memo. */
const NO_TRANSACTIONS: TxFull[] = [];

function toTxFull(item: ApiYearTx): TxFull {
  const source = item.source ?? "";
  // The list route returns displayAmount converted to the profile currency —
  // always render that, never the raw source-currency amount.
  const display = Number(item.displayAmount ?? item.amount);
  return {
    id: item.id,
    name: item.merchant || item.description,
    account: item.account?.name ?? "Ledger",
    date: item.occurredAt.slice(0, 10),
    amount: item.type === "INCOME" ? display : -Math.abs(display),
    category: item.category?.id ?? "other",
    categoryId: item.category?.id,
    categoryName: item.category?.name,
    kind: item.type,
    asset: item.assetSymbol ?? undefined,
    taxable: item.isTaxable,
    source: (source === "email" || source === "card" || source === "wallet" ? source : "manual") as TxFull["source"],
    parse: { state: item.needsReview ? "review" : "parsed" },
    note: "",
  };
}




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
      {(summary?.totals.uncategorizedIncome ?? 0) > 0 || (summary?.totals.uncategorizedExpenses ?? 0) > 0 ? (
        <p className="m-0 -mt-4 text-[12px] leading-relaxed text-muted-foreground">
          Excluded from the totals above — <span className="mono tabular-nums text-foreground">{formatCurrency(summary?.totals.uncategorizedIncome ?? 0, summary?.currency ?? "USD")}</span> uncategorized
          inflow · <span className="mono tabular-nums text-foreground">{formatCurrency(summary?.totals.uncategorizedExpenses ?? 0, summary?.currency ?? "USD")}</span> uncategorized
          outflow. Categorize them in Transactions to count them.
        </p>
      ) : null}
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

/** Shape of `GET /v1/tax/estimate`, which is calculated in the tax jurisdiction's currency. */
type TaxEstimate = {
  country?: string;
  /** Currency the jurisdiction's rules are expressed in. Set by the module, never assumed. */
  currency?: string;
  taxYear?: number;
  taxYearLabel?: string;
  grossIncome?: number;
  taxableIncome?: number;
  estimatedTaxOwed: number;
  filingDeadline: string;
  deductions?: Record<string, number>;
  credits?: Record<string, number>;
  components?: Array<{ key: string; label: string; amount: number }>;
  quarterly?: { required?: boolean; nextPayment?: number; nextDueDate?: string | null };
  notes?: string[];
};

/** Human names for the deduction keys the rule modules emit. */
const DEDUCTION_LABELS: Record<string, string> = {
  rentRelief: "Rent relief",
  pension: "Pension contributions",
  nhf: "National Housing Fund contributions",
  nhis: "National Health Insurance Scheme contributions",
  housingLoanInterest: "Owner-occupied home loan interest",
  lifeAssurance: "Life assurance premiums",
  taxableExpenses: "Deductible business expenses",
  homeOffice: "Home office",
  retirement: "Retirement contributions",
  retirementCap: "Retirement deduction cap",
  donations: "Donations",
  donationsCarriedForward: "Donations carried forward",
  medicalExpenses: "Qualifying medical expenses",
  travelAllowance: "Travel allowance",
  personal: "Personal expenditure",
  halfSelfEmploymentTax: "Half of self-employment tax",
  standardDeduction: "Standard deduction",
  selfEmploymentHealthInsurance: "Self-employed health insurance",
  qualifiedOvertime: "Qualified overtime compensation",
  studentLoanInterest: "Student loan interest",
  insuranceRelief: "Insurance relief",
  housingRelief: "Housing relief",
  postRetirementMedical: "Post-retirement medical fund relief",
  personalRelief: "Personal relief",
  donationsPbo: "Donations to approved organisations",
  ppfContributions: "Provident and pension fund contributions",
  pensionableAllowances: "Pensionable allowances",
  secondarySelfEmployment: "Second self-employment income",
  personalReliefApplied: "Personal relief applied",
  rrsp: "RRSP contributions",
  cppContributions: "CPP contributions",
  professionalDues: "Professional and union dues",
  movingCosts: "Eligible moving costs",
  childCare: "Child care expenses",
  taxableIncomeComponent: "Taxable income",
};

/** Anything a new jurisdiction introduces still reads as words, not a key. */
function humanise(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

type ChecklistItem = { key: string; label: string; status: "READY" | "OUTSTANDING" };

async function fetchTax(api: ReturnType<typeof useApi>) {
  const [estimate, checklist] = await Promise.all([
    api.get<{ data: TaxEstimate }>("/v1/tax/estimate"),
    api.get<{ data: { items: ChecklistItem[] } }>("/v1/tax/checklist"),
  ]);
  return { estimate: estimate.data, items: checklist.data.items };
}

export default function InsightsPage() {
  const [section, setSection] = useState<Section>("cashflow");
  const [range, setRange] = useState<DayRange>(() => {
    const now = new Date();
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999) };
  });
  const [taxEstimate, setTaxEstimate] = useState<TaxEstimate | null>(null);
  const [yearSummary, setYearSummary] = useState<InsightsSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryRetry, setSummaryRetry] = useState(0);
  const [yearTransactions, setYearTransactions] = useState<{ year: number; rows: TxFull[] } | null>(null);
  const [taxChecklist, setTaxChecklist] = useState<Array<{ key: string; label: string; status: "READY" | "OUTSTANDING" }> | null>(null);
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();
  const selectedYear = range.from.getFullYear();

  // Fetched from two places — first mount and after the planning card saves — so
  // the request lives in a plain function and each caller owns its own state
  // timing. Mount reads from the promise callback; the save path is an event
  // handler, where setting state directly is fine.
  const refreshTax = async () => {
    try {
      const { estimate, items } = await fetchTax(api);
      setTaxEstimate(estimate);
      setTaxChecklist(items);
    } catch {
      setTaxEstimate(null);
      setTaxChecklist([]);
    }
  };

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    void fetchTax(api)
      .then(({ estimate, items }) => {
        if (cancelled) return;
        setTaxEstimate(estimate);
        setTaxChecklist(items);
      })
      .catch(() => {
        if (cancelled) return;
        setTaxEstimate(null);
        setTaxChecklist([]);
      });
    return () => { cancelled = true; };
  }, [api, isLoaded, isSignedIn]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    setSummaryLoading(true);
    const from = new Date(selectedYear, 0, 1).toISOString();
    const to = new Date(selectedYear, 11, 31, 23, 59, 59, 999).toISOString();
    void api.get<{ data: InsightsSummary }>(`/v1/insights/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { timeoutMs: AGGREGATE_TIMEOUT_MS }).then((response) => {
      if (!cancelled) setYearSummary(response.data);
    }).catch((error: unknown) => {
      if (cancelled) return;
      setYearSummary(null);
      const guidance = guidanceFor(error, "load");
      toast.error(guidance.title, {
        description: guidanceText(guidance),
        action: { label: "Try again", onPress: () => setSummaryRetry((current) => current + 1) },
      });
    }).finally(() => { if (!cancelled) setSummaryLoading(false); });
    return () => { cancelled = true; };
    // The API client is stable for the current Clerk session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, selectedYear, summaryRetry]);

  // Export runs off this list, so the Insights menu writes a real file instead
  // of a header-less one. Loaded once per year and filtered per active tab.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    const from = new Date(selectedYear, 0, 1).toISOString();
    const to = new Date(selectedYear, 11, 31, 23, 59, 59, 999).toISOString();
    const query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&pageSize=100`;
    void (async () => {
      const first = await api.get<{ data: ApiYearTx[]; meta: { total: number } }>(`/v1/transactions?${query}&page=1`);
      const pageCount = Math.ceil(first.meta.total / 100);
      if (pageCount > 100) throw new Error("This year has too many transactions to export at once.");
      const rest = await Promise.all(
        Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => api.get<{ data: ApiYearTx[] }>(`/v1/transactions?${query}&page=${index + 2}`)),
      );
      return [...first.data, ...rest.flatMap((page) => page.data)];
    })()
      .then((items) => { if (!cancelled) setYearTransactions({ year: selectedYear, rows: items.map(toTxFull) }); })
      .catch(() => { if (!cancelled) setYearTransactions({ year: selectedYear, rows: [] }); });
    return () => { cancelled = true; };
    // The API client is stable for the current Clerk session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, selectedYear]);


  // The jurisdiction, its currency and its tax year all come from the rule module
  // rather than being inferred here — South Africa's year runs March to February
  // and Kenya's currency is KES, neither of which a NG/US check would catch.
  const taxCountry = taxEstimate?.country ?? "NIGERIA";
  const taxCurrency = taxEstimate?.currency ?? "NGN";
  const taxJurisdiction = TAX_JURISDICTIONS.find((entry) => entry.value.toLowerCase().replace(/-/g, "") === String(taxCountry).toLowerCase())
    ?? TAX_JURISDICTIONS.find((entry) => entry.currency === taxCurrency);
  const taxCountryLabel = taxJurisdiction?.name ?? humanise(taxCountry);
  const taxYear = taxEstimate?.taxYear ?? selectedYear;
  const money = (value: number) => formatCurrency(value, taxCurrency);
  const taxNow = taxEstimate?.estimatedTaxOwed ?? 0;
  const taxableIncome = taxEstimate?.taxableIncome ?? 0;
  const deductionsTotal = taxEstimate?.deductions?.total ?? 0;
  const deductionRows = Object.entries(taxEstimate?.deductions ?? {})
    .filter(([key, value]) => key !== "total" && key !== "retirementCap" && key !== "donationsCarriedForward" && Number.isFinite(value) && value > 0)
    .map(([key, value]) => ({
      id: key,
      name: DEDUCTION_LABELS[key] ?? humanise(key),
      captured: value,
      share: deductionsTotal > 0 ? Math.min(100, (value / deductionsTotal) * 100) : 0,
    }));
  const creditRows = Object.entries(taxEstimate?.credits ?? {})
    .filter(([key, value]) => key !== "total" && Number.isFinite(value) && value > 0)
    .map(([key, value]) => ({ id: key, name: DEDUCTION_LABELS[key] ?? humanise(key), captured: value }));
  const componentRows = (taxEstimate?.components ?? []).filter((item) => item.amount > 0);
  const filingDeadline = taxEstimate?.filingDeadline
    ? new Date(taxEstimate.filingDeadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;
  const month = Math.max(0, Math.min(11, range.to.getMonth()));
  const setMonth = (m: number) => {
    const last = new Date(selectedYear, m + 1, 0).getDate();
    setRange({ from: new Date(selectedYear, m, 1), to: new Date(selectedYear, m, last, 23, 59, 59, 999) });
  };
  const toggleChecklist = async (key: string, status: "READY" | "OUTSTANDING") => {
    const next = status === "READY" ? "OUTSTANDING" : "READY";
    try {
      await api.patch(`/v1/tax/checklist/${key}`, { status: next });
    } catch {
      toast.error("Could not update the filing checklist. Try again.");
      return;
    }
    setTaxChecklist((current) => current?.map((item) => item.key === key ? { ...item, status: next } : item) ?? current);
    toast.success(next === "READY" ? "Checklist item marked ready" : "Checklist item marked outstanding");
  };
  const yearTxState = yearTransactions ?? { year: -1, rows: NO_TRANSACTIONS };
  const loadedTransactions = yearTxState.year === selectedYear ? yearTxState.rows : NO_TRANSACTIONS;
  const transactionsLoading = yearTxState.year !== selectedYear;
  const stablecoinTransactions = useMemo(
    () => loadedTransactions.filter((row) => isStablecoinAsset(row.asset)),
    [loadedTransactions],
  );
  const exportRows: TxFull[] = useMemo(() => {
    if (section === "income") return loadedTransactions.filter((row) => row.amount > 0);
    if (section === "spending") return loadedTransactions.filter((row) => row.amount < 0);
    if (section === "stablecoin") return stablecoinTransactions;
    if (section === "tax") return [];
    return loadedTransactions;
  }, [section, loadedTransactions, stablecoinTransactions]);
  const exportFilename =
    section === "cashflow" ? "dobby-cashflow"
    : section === "income" ? "dobby-income"
    : section === "stablecoin" ? "dobby-stablecoin"
    : "dobby-spending";

  return (
    <>
      <div className="w-full px-6 pt-6 pb-10">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Segmented
            label="Insights section"
            value={section}
            onValueChange={setSection}
            options={(["cashflow", "spending", "income", "stablecoin", "tax"] as Section[]).map((s) => ({ value: s, label: <span className="capitalize">{s}</span> }))}
          />
          {section !== "tax" ? <ExportMenu rows={exportRows} filename={exportFilename} /> : null}
        </div>

        {summaryLoading && !yearSummary ? <div className="mb-4 rounded-lg border border-line bg-card px-4 py-3 text-[13px] text-muted-foreground" role="status">Loading this year’s transaction insights…</div> : null}
        {section === "cashflow" ? (
          <CashflowSection year={selectedYear} summary={yearSummary} />
        ) : section === "spending" ? (
          <SpendingSection month={month} year={selectedYear} yearSummary={yearSummary} onMonthChange={setMonth} />
        ) : section === "income" ? (
          <IncomeSection month={month} year={selectedYear} yearSummary={yearSummary} onMonthChange={setMonth} />
        ) : section === "stablecoin" ? (
          <StablecoinSection
            year={selectedYear}
            month={month}
            onMonthChange={setMonth}
            rows={stablecoinTransactions}
            loading={transactionsLoading}
          />
        ) : (
          <div>
            <div className="grid grid-cols-1 items-start gap-x-8 gap-y-8 md:grid-cols-2">
              <section aria-label="Deductions">
                <h2 className="m-0 text-[13px] font-semibold">Deductions</h2>
                <p className="m-0 mt-1 text-[12px] text-muted-foreground">{taxYear} estimate · {taxCountryLabel} rules</p>
                {deductionRows.length === 0 ? (
                  <p className="m-0 mt-2 text-[13px] leading-relaxed text-muted-foreground">
                    No deductions captured yet — deductible expenses are counted automatically as you categorise transactions.
                  </p>
                ) : (
                  <>
                    <ul className="m-0 mt-2 list-none p-0">
                      {deductionRows.map((d) => {
                        const done = d.share >= 100;
                        return (
                          <li key={d.id} className="border-b border-line py-2 last:border-b-0">
                            <div className="flex items-center gap-2 text-[13px]">
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">{d.name}</span>
                                <span className="block truncate text-[12px] text-muted-foreground">{d.share.toFixed(0)}% of total deductions</span>
                              </span>
                              <span className="mono shrink-0 text-right text-[13px] font-medium tabular-nums">{money(d.captured)}</span>
                            </div>
                            <div className="mt-1.5">
                              <Meter value={d.share} tone={done ? "green" : "accent"} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="m-0 mt-2 text-[13px]">
                      <span className="text-muted-foreground">Total deductions </span>
                      <span className="mono font-semibold tabular-nums">{money(deductionsTotal)}</span>
                    </p>
                  </>
                )}
              </section>

              <section aria-label="Tax position">
                <h2 className="m-0 text-[13px] font-semibold">Tax position</h2>
                <p className="m-0 mt-1 text-[12px] text-muted-foreground">
                  Using {taxCountryLabel} rules · {taxEstimate?.taxYearLabel ?? taxYear}
                </p>
                <p className="mono m-0 mt-1 text-[20px] font-semibold tracking-[-0.02em] tabular-nums">
                  {money(taxNow)}
                </p>
                <p className="m-0 text-[12px] text-muted-foreground">
                  Estimated tax on {money(taxableIncome)} of taxable income
                </p>
                {componentRows.length > 1 ? (
                  <ul className="m-0 mt-2 list-none p-0 border-b border-line pb-2">
                    {componentRows.map((item) => (
                      <li key={item.key} className="flex items-center justify-between gap-2 py-0.5 text-[13px]">
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.label}</span>
                        <span className="mono shrink-0 font-medium tabular-nums">{money(item.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {creditRows.length > 0 ? (
                  <div className="mt-2">
                    <p className="m-0 text-[12px] font-medium text-muted-foreground">Credits applied after tax</p>
                    <ul className="m-0 mt-1 list-none p-0">
                      {creditRows.map((row) => (
                        <li key={row.id} className="flex items-center justify-between gap-2 py-0.5 text-[13px]">
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">{row.name}</span>
                          <span className="mono shrink-0 tabular-nums">-{money(row.captured)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="mt-3 space-y-1.5 text-[13px] leading-relaxed">
                  {filingDeadline ? (
                    <p className="m-0">File or pay by <span className="mono font-medium tabular-nums">{filingDeadline}</span>.</p>
                  ) : null}
                  {taxEstimate?.quarterly?.required ? (
                    <p className="m-0">
                      Next estimated payment{" "}
                      <span className="mono font-medium tabular-nums">{money(taxEstimate.quarterly.nextPayment ?? 0)}</span>
                      {taxEstimate.quarterly.nextDueDate ? (
                        <>
                          {" "}due{" "}
                          <span className="mono font-medium tabular-nums">
                            {new Date(taxEstimate.quarterly.nextDueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        </>
                      ) : null}
                      .
                    </p>
                  ) : (
                    <p className="m-0 text-muted-foreground">No quarterly estimated payments required at this income level.</p>
                  )}
                </div>
                {taxEstimate?.notes?.[0] ? (
                  <p className="m-0 mt-2 text-[12px] text-muted-foreground">{taxEstimate.notes[0]}</p>
                ) : null}
                {taxEstimate?.notes?.slice(1).map((note) => (
                  <p key={note} className="m-0 mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{note}</p>
                ))}
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
                        <span className={`min-w-0 flex-1 truncate font-medium ${ready ? "text-success" : "text-warning"}`}>{label}</span>
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

            <div className="mt-8">
              <TaxPlanningCard onSaved={() => void refreshTax()} />
            </div>

            <Alert status="default" className="mt-8">
              <AlertIndicator>
                <AlertIcon />
              </AlertIndicator>
              <AlertContent>
                <AlertDescription className="text-card-foreground">
                  General guidance only — figures are estimates from your tracked data and nothing here is filed on your behalf.
                </AlertDescription>
              </AlertContent>
            </Alert>
          </div>
        )}
      </div>
    </>
  );
}
