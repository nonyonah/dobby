"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useApi } from "@/hooks/use-api";
import { CheckCircleIcon, CheckIcon } from "./icons";
import { formatCurrency } from "@/lib/format";

import { ModuleCard } from "./module-card";
import { Skeleton } from "./ui/skeleton";

type Estimate = {
  country?: string;
  taxYear?: number;
  estimatedTaxOwed: number;
  filingDeadline: string;
  deductions?: Record<string, number>;
  quarterly?: { required?: boolean; nextPayment?: number; nextDueDate?: string | null };
};

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function TaxInsightsCard({ bare = false }: { bare?: boolean }) {
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [checklist, setChecklist] = useState<Array<{ key: string; label: string; status: "READY" | "OUTSTANDING" }> | null>(null);
  const [loaded, setLoaded] = useState(false);
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    void Promise.all([
      api.get<{ data: Estimate }>("/v1/tax/estimate"),
      api.get<{ data: { items: Array<{ key: string; label: string; status: "READY" | "OUTSTANDING" }> } }>("/v1/tax/checklist"),
    ]).then(([tax, docs]) => { setEstimate(tax.data); setChecklist(docs.data.items); }).catch(() => { setEstimate(null); setChecklist([]); }).finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);
  const owed = estimate?.estimatedTaxOwed ?? 0;
  const currency = estimate?.country === "US" ? "USD" : "NGN";
  const money = (value: number) => formatCurrency(value, currency);
  const taxYear = estimate?.taxYear ?? new Date().getFullYear();
  const deductionsTotal = estimate?.deductions?.total ?? 0;
  const deadline = estimate?.filingDeadline ?? null;
  const daysToDeadline = deadline ? Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000) : null;
  const nextDue = estimate?.quarterly?.required && estimate?.quarterly?.nextDueDate
    ? { payment: estimate.quarterly.nextPayment ?? 0, due: estimate.quarterly.nextDueDate }
    : null;
  const docs = checklist ?? [];
  const done = docs.filter((d) => d.status === "READY").length;
  const readiness = docs.length ? Math.round((done / docs.length) * 100) : 0;

  if (!loaded) {
    return (
      <ModuleCard title="Tax insights" linkLabel="Insights" href="/insights" bare={bare}>
        <Skeleton className="h-7 w-28" />
        <Skeleton className="mt-2 h-4 w-40" />
        <Skeleton className="mt-4 h-2 w-full rounded-full" />
        <div className="my-3 border-t border-soft-line" />
        <Skeleton className="h-4 w-52" />
        <Skeleton className="mt-2 h-3 w-full" />
        <Skeleton className="mt-1.5 h-3 w-5/6" />
      </ModuleCard>
    );
  }

  return (
    <ModuleCard title="Tax insights" linkLabel="Insights" href="/insights" bare={bare}>
      {owed <= 0 ? (
        <div className="flex flex-col items-center px-4 py-4 text-center">
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-full border border-success/40 bg-success-soft"
          >
            <CheckCircleIcon className="text-success-vivid" />
          </span>
          <p className="mt-3 mb-0 text-[13px] font-semibold text-foreground">Nil return</p>
          <p className="mt-1 mb-0 text-[12px] text-muted-foreground">
            Nothing owed — you&apos;re all clear for the year
          </p>
        </div>
      ) : (
        <>
          <p className="mono m-0 text-[20px] font-semibold tracking-[-0.02em] tabular-nums">
            {money(owed)}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="m-0 text-[12px] text-muted-foreground">Estimated tax · {taxYear}</p>
            <span className="rounded-full border-transparent bg-[#ffc8dd] px-2 py-0.5 text-[12px] font-semibold text-white">
              Informational estimate
            </span>
          </div>
          <div className="mt-3 rounded-xl border border-soft-line px-3 py-2.5">
            <p className="m-0 text-[12px] font-semibold text-foreground">Reminder</p>
            {deadline ? (
              <p className="m-0 mt-1 text-[12px] leading-relaxed text-muted-foreground">
                Set aside{" "}
                <span className="mono font-medium tabular-nums text-foreground">{money(owed)}</span>{" "}
                by <span className="mono font-medium tabular-nums text-foreground">{formatDay(deadline)}</span>
                {daysToDeadline !== null && daysToDeadline > 0 ? ` — ${daysToDeadline} days left` : " — due now"}.
              </p>
            ) : (
              <p className="m-0 mt-1 text-[12px] leading-relaxed text-muted-foreground">
                Set aside{" "}
                <span className="mono font-medium tabular-nums text-foreground">{money(owed)}</span>{" "}
                for this year&apos;s estimate.
              </p>
            )}
            {deductionsTotal > 0 ? (
              <p className="m-0 mt-1 text-[12px] leading-relaxed text-muted-foreground">
                <span className="mono font-medium tabular-nums">{money(deductionsTotal)}</span> of
                deductions already reduce this figure.
              </p>
            ) : null}
            {nextDue ? (
              <p className="m-0 mt-1 text-[12px] leading-relaxed text-muted-foreground">
                Next estimated payment{" "}
                <span className="mono font-medium tabular-nums">{money(nextDue.payment)}</span> due{" "}
                <span className="mono font-medium tabular-nums">{formatDay(nextDue.due)}</span>.
              </p>
            ) : null}
          </div>
        </>
      )}

      <div className="my-3 border-t border-soft-line" />

      <div className="flex items-baseline gap-2">
        <p className="mono m-0 text-[16px] font-semibold tracking-[-0.02em] tabular-nums">
          {readiness}%
        </p>
        <p className="m-0 text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">
          {done} of {docs.length} documents your accountant will ask for
        </p>
      </div>
      <ul className="m-0 mt-1 list-none p-0">
        {docs.map((d) => (
          <li
            key={d.key}
            className="flex items-center gap-2 border-b border-soft-line py-1.5 text-[13px] last:border-b-0"
          >
            {d.status === "READY" ? (
              <CheckIcon className="shrink-0 text-success" />
            ) : (
              <span
                aria-hidden="true"
                className="size-3.5 shrink-0 rounded-full border border-line"
              />
            )}
            <span className={`min-w-0 flex-1 truncate ${d.status === "READY" ? "text-foreground" : "text-muted-foreground"}`}>
              {d.label}
            </span>
          </li>
        ))}
      </ul>

      <p className="m-0 mt-3 text-[12px] leading-relaxed text-muted-foreground">
        Advisory only — Dobby doesn&apos;t prepare or file returns.
      </p>
    </ModuleCard>
  );
}
