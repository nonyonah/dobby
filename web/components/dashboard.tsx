"use client";

import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { IncomeExpensesCard } from "./income-expenses-card";
import { BudgetSnapshotCard } from "./budget-snapshot-card";
import { TransactionsCard } from "./transactions-card";
import { TaxInsightsCard } from "./tax-insights-card";
import { AttentionCard } from "./attention-card";
import { ProactiveFlags } from "./proactive-flags";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { FEATURES } from "@/lib/features";
import { formatCurrency, getAppCurrency } from "@/lib/format";
import { useApi } from "@/hooks/use-api";

/** Dashboard cards the user can toggle. Hidden features are omitted from the list. */
const CUSTOMIZE_CARDS: { id: string; label: string; enabled: boolean }[] = [
  { id: "budget", label: "Budget", enabled: FEATURES.budgeting },
  { id: "transactions", label: "Transactions", enabled: true },
  { id: "tax", label: "Tax insights", enabled: true },
  { id: "attention", label: "Needs attention", enabled: true },
  { id: "flags", label: "Proactive flags", enabled: true },
];

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Homepage header: a time-aware greeting and the live net worth figure
 * (wallet holdings + ledger balances, including imported transactions) on one
 * line, shown in the user's selected currency — never hardcoded to USD.
 * Shown to every signed-in user; it is not a Pro feature.
 */
function HomeGreeting() {
  const api = useApi();
  const { user } = useUser();
  const { isLoaded, isSignedIn } = useAuth();
  const [netWorth, setNetWorth] = useState<{ amount: number; currency: string } | null>(null);
  const firstName = user?.firstName || user?.username || "";
  const greeting = greetingForHour(new Date().getHours());

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    const target = getAppCurrency();
    void api
      .get<{ data: { totalUsd: number } }>("/v1/insights/net-worth")
      .then((response) => {
        if (cancelled) return;
        const totalUsd = response.data.totalUsd ?? 0;
        if (target === "USD") {
          setNetWorth({ amount: totalUsd, currency: "USD" });
          return;
        }
        void api
          .get<{ data: { convertedAmount: number } }>(
            `/v1/currency/convert?amount=${encodeURIComponent(totalUsd)}&from=USD&to=${encodeURIComponent(target)}`,
          )
          .then((conversion) => {
            if (!cancelled) setNetWorth({ amount: conversion.data.convertedAmount, currency: target });
          })
          .catch(() => {
            if (!cancelled) setNetWorth({ amount: totalUsd, currency: "USD" });
          });
      })
      .catch(() => { if (!cancelled) setNetWorth(null); });
    return () => { cancelled = true; };
  }, [api, isLoaded, isSignedIn]);

  return (
    <p className="m-0 min-w-0 truncate text-[13px] text-muted-foreground" suppressHydrationWarning>
      <span className="font-semibold text-foreground">{greeting}{firstName ? `, ${firstName}` : ""}</span>
      {" · you're worth "}
      <span className="mono font-medium tabular-nums text-foreground">
        {netWorth === null ? "—" : formatCurrency(netWorth.amount, netWorth.currency)}
      </span>
      {netWorth === null ? "" : " right now"}
    </p>
  );
}

/**
 * Dashboard content: Copilot-style module grid — income vs expenses,
 * budget snapshot and transactions on the left; tax insights and
 * attention items on the right.
 */
export function Dashboard() {
  const [customize, setCustomize] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const toggle = (id: string) => setHidden((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const visible = (id: string) => !hidden.includes(id);
  const cards = CUSTOMIZE_CARDS.filter((card) => card.enabled);
  return (
    <div className="w-full px-6 pt-6 pb-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <HomeGreeting />
        <Popover open={customize} onOpenChange={setCustomize}><PopoverTrigger render={<Button variant="ghost" size="small" aria-expanded={customize}>Customize</Button>} /><PopoverContent align="end" className="w-52 gap-1 p-1.5"><p className="px-2 py-1 text-[12px] font-medium text-muted-foreground">Dashboard cards</p>{cards.map(({ id, label }) => <button key={id} type="button" aria-pressed={visible(id)} onClick={() => toggle(id)} className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-[13px] hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><span>{label}</span><span aria-hidden="true" className={visible(id) ? "text-primary" : "text-muted-foreground"}>{visible(id) ? "✓" : ""}</span></button>)}<div className="my-1 border-t border-soft-line" /><button type="button" onClick={() => setHidden([])} className="w-full rounded-md px-2 py-2 text-left text-[13px] text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">Reset layout</button></PopoverContent></Popover>
      </div>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4"><IncomeExpensesCard />{FEATURES.budgeting && visible("budget") ? <BudgetSnapshotCard /> : null}{visible("transactions") ? <TransactionsCard /> : null}</div>
        <div className="flex min-w-0 flex-col gap-4">{visible("tax") ? <TaxInsightsCard /> : null}{visible("attention") ? <AttentionCard /> : null}{visible("flags") ? <ProactiveFlags /> : null}</div>
      </div>
    </div>
  );
}
