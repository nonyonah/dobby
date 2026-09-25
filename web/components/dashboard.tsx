"use client";

import { useState } from "react";
import { IncomeExpensesCard } from "./income-expenses-card";
import { BudgetSnapshotCard } from "./budget-snapshot-card";
import { TransactionsCard } from "./transactions-card";
import { TaxInsightsCard } from "./tax-insights-card";
import { AttentionCard } from "./attention-card";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { FEATURES } from "@/lib/features";

/** Dashboard cards the user can toggle. Hidden features are omitted from the list. */
const CUSTOMIZE_CARDS: { id: string; label: string; enabled: boolean }[] = [
  { id: "budget", label: "Budget", enabled: FEATURES.budgeting },
  { id: "transactions", label: "Transactions", enabled: true },
  { id: "tax", label: "Tax insights", enabled: true },
  { id: "attention", label: "Needs attention", enabled: true },
];

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
      <div className="mb-4 flex justify-end"><Popover open={customize} onOpenChange={setCustomize}><PopoverTrigger render={<Button variant="ghost" size="small" aria-expanded={customize}>Customize</Button>} /><PopoverContent align="end" className="w-52 gap-1 p-1.5"><p className="px-2 py-1 text-[12px] font-medium text-muted-foreground">Dashboard cards</p>{cards.map(({ id, label }) => <button key={id} type="button" aria-pressed={visible(id)} onClick={() => toggle(id)} className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-[13px] hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><span>{label}</span><span aria-hidden="true" className={visible(id) ? "text-primary" : "text-muted-foreground"}>{visible(id) ? "✓" : ""}</span></button>)}<div className="my-1 border-t border-soft-line" /><button type="button" onClick={() => setHidden([])} className="w-full rounded-md px-2 py-2 text-left text-[13px] text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">Reset layout</button></PopoverContent></Popover></div>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4"><IncomeExpensesCard />{FEATURES.budgeting && visible("budget") ? <BudgetSnapshotCard /> : null}{visible("transactions") ? <TransactionsCard /> : null}</div>
        <div className="flex min-w-0 flex-col gap-4">{visible("tax") ? <TaxInsightsCard /> : null}{visible("attention") ? <AttentionCard /> : null}</div>
      </div>
    </div>
  );
}
