"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useApi } from "@/hooks/use-api";
import { formatUSD } from "@/lib/format";
import { BUDGET_LIMIT, CATEGORIES, type Category } from "@/lib/finance";
import { Meter, ModuleCard } from "./module-card";

export function BudgetSnapshotCard() {
  const [live, setLive] = useState<{ spent: number; limit: number; categories: Category[] } | null>(null);
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    void Promise.all([
      api.get<{ data: Array<{ category: { id: string; name: string }; type: "FIXED" | "PERCENTAGE"; value: number | string; isExcluded: boolean }> }>("/v1/budgets"),
      api.get<{ data: { spendingByCategory: Array<{ name: string; amount: number; color?: string | null }> } }>("/v1/insights/summary"),
    ]).then(([budgets, insights]) => {
      const categories = budgets.data.map((budget) => { const spending = insights.data.spendingByCategory.find((item) => item.name.toLowerCase() === budget.category.name.toLowerCase())?.amount ?? 0; return { id: budget.category.id, name: budget.category.name, emoji: "📊", spent: spending, budget: Number(budget.value), dot: "#4a55c9" }; });
      setLive({ spent: categories.reduce((sum, item) => sum + item.spent, 0), limit: categories.reduce((sum, item) => sum + item.budget, 0), categories });
    }).catch(() => { /* fixture fallback */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);
  const displayedCategories = live?.categories ?? CATEGORIES;
  const spent = live?.spent ?? CATEGORIES.reduce((sum, c) => sum + c.spent, 0);
  const budgetLimit = live?.limit ?? BUDGET_LIMIT;

  return (
    <ModuleCard title="Budget snapshot" linkLabel="View all">
      <p className="m-0 text-[13px] font-medium text-foreground">
        <span className="mono font-semibold tabular-nums">{formatUSD(spent)}</span>{" "}
        <span className="font-normal text-muted-foreground">of {formatUSD(budgetLimit)} spent</span>
      </p>
      <div className="mt-2">
        <Meter value={(spent / budgetLimit) * 100} tone="green" />
      </div>
      <ul className="m-0 mt-1 list-none p-0">
        {displayedCategories.map((c) => {
          const over = c.spent > c.budget;
          return (
            <li
              key={c.id}
              className="flex items-center gap-2 border-b border-soft-line py-2 text-[13px] last:border-b-0 last:pb-0"
            >
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: c.dot }}
              />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {c.name}
              </span>
              <span className={`mono shrink-0 font-medium tabular-nums ${over ? "text-danger" : "text-foreground"}`}>
                {formatUSD(c.spent)}
              </span>
              <span className="w-24 shrink-0">
                <Meter value={(c.spent / c.budget) * 100} tone={over ? "red" : "green"} />
              </span>
              <span className="mono w-14 shrink-0 text-right text-[12px] text-muted-foreground tabular-nums">
                {formatUSD(c.budget)}
              </span>
            </li>
          );
        })}
      </ul>
    </ModuleCard>
  );
}
