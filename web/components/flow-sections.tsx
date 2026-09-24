"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useApi } from "@/hooks/use-api";
import { formatUSD } from "@/lib/format";
import { SOURCE_COLOR_MAP, type InsightsSummary } from "@/lib/cashflow";
import type { TxSource } from "@/lib/finance";
import type { TxFull } from "@/lib/transactions";
import { BreakdownPie } from "./breakdown-pie";
import { FlowNarrative } from "./flow-narrative";
import { FlowTable } from "./flow-table";

const MONTHS = [
  { value: 0, label: "January" },
  { value: 1, label: "February" },
  { value: 2, label: "March" },
  { value: 3, label: "April" },
  { value: 4, label: "May" },
  { value: 5, label: "June" },
  { value: 6, label: "July" },
  { value: 7, label: "August" },
  { value: 8, label: "September" },
  { value: 9, label: "October" },
  { value: 10, label: "November" },
  { value: 11, label: "December" },
];

function momDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function useLiveMonth(month: number, year: number, income: boolean) {
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();
  const [rows, setRows] = useState<TxFull[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const from = new Date(year, month, 1).toISOString();
    const to = new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString();
    const query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&type=${income ? "INCOME" : "EXPENSE"}&pageSize=100`;

    const loadRows = async () => {
      const first = await api.get<{
        data: Array<{ id: string; description: string; merchant?: string | null; amount: number | string; occurredAt: string }>;
        meta: { total: number };
      }>(`/v1/transactions?${query}&page=1`);
      const pageCount = Math.ceil(first.meta.total / 100);
      if (pageCount > 100) throw new Error("This month has too many transactions to load at once.");
      const otherPages = await Promise.all(Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
        api.get<{ data: typeof first.data }>(`/v1/transactions?${query}&page=${index + 2}`),
      ));
      return [...first.data, ...otherPages.flatMap((page) => page.data)];
    };

    void loadRows().then((transactions) => {
      if (cancelled) return;
      setRows(transactions.map((item) => ({
        id: item.id,
        name: item.merchant || item.description,
        account: "Ledger",
        date: item.occurredAt.slice(0, 10),
        amount: income ? Number(item.amount) : -Math.abs(Number(item.amount)),
        category: "other",
        taxable: false,
        source: "manual" as TxSource,
        parse: { state: "parsed" as const },
        note: "",
      })));
    }).catch((reason: unknown) => {
      if (cancelled) return;
      setRows([]);
      setError(reason instanceof Error ? reason.message : "Could not load this month's transactions.");
    }).finally(() => { if (!cancelled) setLoading(false); });

    // The API client is stable for the current Clerk session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, month, year, income, retryCount]);

  return { rows, error, loading, retry: () => setRetryCount((count) => count + 1) };
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function requestError(message: string, retry: () => void) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px]" role="alert">
      <span>{message}</span>
      <button type="button" onClick={retry} className="rounded-md px-3 py-1.5 font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">Try again</button>
    </div>
  );
}

export function SpendingSection({ month, year, yearSummary, onMonthChange }: { month: number; year: number; yearSummary: InsightsSummary | null; onMonthChange: (month: number) => void }) {
  const { rows, error, loading, retry } = useLiveMonth(month, year, false);
  const selectedMonth = monthKey(year, month);
  const items = (yearSummary?.monthlySpendingByCategory ?? [])
    .filter((item) => item.month === selectedMonth && item.amount > 0)
    .map((item) => ({ id: item.categoryId ?? "uncategorized", name: item.name, amount: item.amount, color: item.color ?? "#8a8b91" }));
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const top = [...items].sort((left, right) => right.amount - left.amount)[0];

  return (
    <div className="flex flex-col gap-4">
      {error ? requestError(`Couldn’t load spending transactions: ${error}`, retry) : null}
      <BreakdownPie title="Spending by category" items={items} month={month} year={year} months={MONTHS} onMonthChange={onMonthChange} />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {loading ? <div className="mb-2 rounded-md bg-secondary px-3 py-2 text-[12px] text-muted-foreground" role="status">Loading transactions for this month…</div> : null}
          <FlowTable title="Transactions" typeLabel="Spending" filterLabel="All categories" rows={rows} />
        </div>
        <FlowNarrative title="Spending summary">
          <p className="m-0">You spent <strong>{formatUSD(total)}</strong> this month.</p>
          {top ? <p className="m-0"><strong>{top.name}</strong> led at {formatUSD(top.amount)} — {total > 0 ? Math.round((top.amount / total) * 100) : 0}% of everything out.</p> : null}
        </FlowNarrative>
      </div>
    </div>
  );
}

export function IncomeSection({ month, year, yearSummary, onMonthChange }: { month: number; year: number; yearSummary: InsightsSummary | null; onMonthChange: (month: number) => void }) {
  const { rows, error, loading, retry } = useLiveMonth(month, year, true);
  const selectedMonth = monthKey(year, month);
  const items = (yearSummary?.monthlyIncomeBySource ?? [])
    .filter((item) => item.month === selectedMonth && item.amount > 0)
    .map((item) => ({ id: item.source, name: item.source, amount: item.amount, color: SOURCE_COLOR_MAP[item.source.toLowerCase()] ?? "#8a8b91" }));
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const top = [...items].sort((left, right) => right.amount - left.amount)[0];

  return (
    <div className="flex flex-col gap-4">
      {error ? requestError(`Couldn’t load income transactions: ${error}`, retry) : null}
      <BreakdownPie title="Income by source" items={items} month={month} year={year} months={MONTHS} onMonthChange={onMonthChange} />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {loading ? <div className="mb-2 rounded-md bg-secondary px-3 py-2 text-[12px] text-muted-foreground" role="status">Loading transactions for this month…</div> : null}
          <FlowTable title="Transactions" typeLabel="Income" filterLabel="All sources" rows={rows} income />
        </div>
        <FlowNarrative title="Income summary">
          <p className="m-0"><strong>{formatUSD(total)}</strong> came in this month.</p>
          {top ? <p className="m-0"><strong>{top.name}</strong> carried it with {formatUSD(top.amount)} — {total > 0 ? Math.round((top.amount / total) * 100) : 0}% of everything in.</p> : null}
        </FlowNarrative>
      </div>
    </div>
  );
}
