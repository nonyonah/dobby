"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertIcon, CheckIcon, CloseSmallIcon } from "./icons";
import { ModuleCard } from "./module-card";
import { useApi } from "@/hooks/use-api";
import { usePlan } from "@/components/plan-provider";
import { UpgradeCard } from "@/components/upgrade";
import { toast } from "@/components/ui/toast";

type Flag = { id: string; kind: string; title: string; detail: string; href: string };
type FlagsResult = { flags: Flag[]; currency: string; periodLabel: string | null; asOf: string };

/**
 * Pro: flags computed from the ledger (unusual spend, missed deductions).
 * Free accounts get an inline upgrade prompt instead of the list.
 */
export function ProactiveFlags() {
  const api = useApi();
  const { isPro, loading: planLoading } = usePlan();
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [periodLabel, setPeriodLabel] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isPro) return;
    let cancelled = false;
    void api
      .get<{ data: FlagsResult }>("/v1/insights/flags")
      .then((response) => {
        if (cancelled) return;
        setFlags(response.data.flags);
        setPeriodLabel(response.data.periodLabel);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setFlags([]);
        const message = error instanceof Error ? error.message : "unknown error";
        toast.error(`Couldn’t load proactive flags: ${message}`, {
          action: { label: "Try again", onPress: () => setAttempt((current) => current + 1) },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [api, isPro, attempt]);

  if (!isPro) {
    if (planLoading) return null;
    return (
      <UpgradeCard
        feature="Proactive AI flags"
        title="Get proactive flags"
        description="Dobby watches your ledger for unusual spend and possible missed deductions, then surfaces them here for review."
      />
    );
  }

  const visible = (flags ?? []).filter((flag) => !dismissed.includes(flag.id));

  return (
    <ModuleCard title="Proactive flags">
      {flags === null ? (
        <p className="m-0 py-2 text-[12px] text-muted-foreground" role="status">Scanning your ledger for flags…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-md bg-muted px-3 py-4 text-center" role="status">
          <p className="m-0 text-[13px] font-medium">You’re all caught up</p>
          <p className="m-0 mt-1 text-[12px] text-muted-foreground">New flags appear as your tracked data changes.</p>
        </div>
      ) : (
        <ul className="m-0 list-none p-0">
          {visible.map((flag) => (
            <li key={flag.id} className="flex items-start gap-2.5 border-b border-soft-line py-2 last:border-b-0">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-warning-soft text-warning" aria-hidden="true">
                <AlertIcon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{flag.title}</span>
                <span className="block text-[12px] leading-4 text-muted-foreground">{flag.detail}</span>
                <Link href={flag.href} className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline">
                  <CheckIcon /> Review
                </Link>
              </span>
              <button
                type="button"
                onClick={() => setDismissed((current) => [...current, flag.id])}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                aria-label={`Dismiss ${flag.title}`}
              >
                <CloseSmallIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="m-0 mt-3 text-[11px] leading-relaxed text-muted-foreground">
        {periodLabel ? `Computed from your ledger through ${periodLabel}. ` : ""}
        Suggestions are advisory only. Dobby will never change a transaction without your approval.
      </p>
    </ModuleCard>
  );
}
