"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useApi } from "@/hooks/use-api";
import { CheckCircleIcon, CheckIcon } from "./icons";
import { formatUSD } from "@/lib/format";
import { TAX_DOCS, TAX_DUE, TAX_POSITION } from "@/lib/finance";
import { Meter, ModuleCard } from "./module-card";

export function TaxInsightsCard({ bare = false }: { bare?: boolean }) {
  const [estimate, setEstimate] = useState<{ estimatedTaxOwed: number } | null>(null);
  const [checklist, setChecklist] = useState<Array<{ key: string; label: string; status: "READY" | "OUTSTANDING" }> | null>(null);
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    void Promise.all([
      api.get<{ data: { estimatedTaxOwed: number } }>("/v1/tax/estimate"),
      api.get<{ data: { items: Array<{ key: string; label: string; status: "READY" | "OUTSTANDING" }> } }>("/v1/tax/checklist"),
    ]).then(([tax, docs]) => { setEstimate(tax.data); setChecklist(docs.data.items); }).catch(() => { /* fixture fallback */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);
  const owed = (estimate?.estimatedTaxOwed ?? TAX_POSITION.estimated) - TAX_POSITION.paid;
  const paidPct = (TAX_POSITION.paid / TAX_POSITION.estimated) * 100;
  const docs = checklist ?? TAX_DOCS.map((item) => ({ key: item.id, label: item.label, status: item.done ? "READY" as const : "OUTSTANDING" as const }));
  const done = docs.filter((d) => d.status === "READY").length;
  const readiness = docs.length ? Math.round((done / docs.length) * 100) : 0;

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
            {formatUSD(owed)}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="m-0 text-[12px] text-muted-foreground">Estimated owed</p>
            <span className="rounded-full border-transparent bg-[#ffc8dd] px-2 py-0.5 text-[12px] font-semibold text-white">
              {TAX_DUE.sub}
            </span>
          </div>
          <div className="mt-3">
            <Meter value={paidPct} tone="accent" />
          </div>
          <div className="mt-2 flex justify-between gap-3 text-[12px]">
            <span className="text-[#8a8b91] dark:text-[#a2a3a8]">Paid {formatUSD(TAX_POSITION.paid)}</span>
            <span className="mono text-[#1c1d20] dark:text-[#eceef0] tabular-nums">
              {formatUSD(TAX_POSITION.estimated)} est.
            </span>
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
