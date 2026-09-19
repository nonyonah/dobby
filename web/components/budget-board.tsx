"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { formatUSD } from "@/lib/format";
import { CATEGORIES } from "@/lib/finance";
import {
  budgetAmount,
  categorySpent,
  type BudgetDef,
} from "@/lib/budgets";
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "./ui/chart";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { FilledChevronDownIcon, SettingsIcon } from "./icons";

interface BudgetBoardProps {
  budgets: Record<string, BudgetDef>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const chartConfig = { value: { label: "Spent", color: "#4a55c9" } } satisfies ChartConfig;

export function BudgetBoard({ budgets, selectedId, onSelect }: BudgetBoardProps) {
  const [openRegular, setOpenRegular] = useState(true);
  const [openExcluded, setOpenExcluded] = useState(false);
  const [chartView, setChartView] = useState<"month" | "all">("month");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const reduce = useReducedMotion() ?? false;
  const expand = {
    initial: reduce ? { opacity: 0 } : { height: 0, opacity: 0 },
    animate: { height: "auto", opacity: 1 },
    exit: reduce ? { opacity: 0 } : { height: 0, opacity: 0 },
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const },
  };
  const regular = CATEGORIES.filter((c) => !budgets[c.id]?.excluded);
  const excluded = CATEGORIES.filter((c) => budgets[c.id]?.excluded);
  const spent = regular.reduce((s, c) => s + categorySpent(c.id), 0);
  const total = regular.reduce((s, c) => s + (budgets[c.id] ? budgetAmount(budgets[c.id]) : 0), 0);

  const donut = regular.filter((c) => categorySpent(c.id) > 0).map((c) => ({ name: c.name, value: categorySpent(c.id), fill: c.dot }));
  const summarySpent = chartView === "month" ? spent : spent * 7;
  const summaryBudget = chartView === "month" ? total : total * 7;
  const summaryLabel = chartView === "month" ? "in September" : "across all time";
  const projectedMonthSpend = Math.round((spent / 18) * 30);
  const projectedDifference = total - projectedMonthSpend;

  const row = (c: (typeof CATEGORIES)[number], isExcluded: boolean) => {
    const def = budgets[c.id];
    const amount = def ? budgetAmount(def) : 0;
    const s = categorySpent(c.id);
    const pct = amount > 0 ? Math.min(100, (s / amount) * 100) : 0;
    const over = amount > 0 && s > amount;
    const selected = c.id === selectedId;
    return (
      <button
        key={c.id}
        type="button"
        onClick={() => onSelect(c.id)}
        aria-current={selected ? "true" : undefined}
        className={`grid w-full cursor-pointer grid-cols-[1.5rem_minmax(0,9rem)_5rem_minmax(0,1fr)_5rem_2.5rem] items-center gap-3 rounded-[10px] px-3 py-2 text-left outline-none transition-colors focus-visible:outline-2 focus-visible:outline-[#4a55c9] ${
          selected ? "bg-accent/30" : "hover:bg-secondary"
        }`}
      >
        <span aria-hidden="true" className="text-center text-[15px]">
          {c.emoji}
        </span>
        <span className="truncate text-[13px] font-medium text-foreground">{c.name}</span>
        <span className={`mono text-right text-[13px] font-medium tabular-nums ${over ? "text-danger" : "text-foreground"}`}>
          {formatUSD(s)}
        </span>
        <span className="min-w-0">
          {isExcluded || amount <= 0 ? (
            <span className="inline-flex rounded-full border border-line bg-secondary px-2 py-0.5 text-[12px] text-muted-foreground">
              Excluded
            </span>
          ) : (
            <span className="block h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: c.dot }} />
            </span>
          )}
        </span>
        <span className="mono text-right text-[13px] tabular-nums text-muted-foreground">
          {isExcluded || amount <= 0 ? "—" : formatUSD(amount)}
        </span>
        <span className="flex justify-end">
          {def?.type === "percent" && !isExcluded ? (
            <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[11px] font-semibold text-accent-foreground tabular-nums">
              {def.value}%
            </span>
          ) : null}
        </span>
      </button>
    );
  };

  return (
    <>
    <div>
      <div className="rounded-xl border border-line bg-card px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-center">
            <p className="mono m-0 text-[20px] font-semibold tabular-nums">{formatUSD(summarySpent)}</p>
            <p className="m-0 text-[12px] text-muted-foreground">spent {summaryLabel}</p>
          </div>
          <div className="relative">
            <ChartContainer config={chartConfig} className="aspect-square h-30 w-30 shrink-0">
              <PieChart>
                <Tooltip content={<ChartTooltipContent className="bg-card" formatter={(v) => formatUSD(Number(v))} />} />
                <Pie data={donut} dataKey="value" nameKey="name" innerRadius={36} outerRadius={52} paddingAngle={2} cornerRadius={6} strokeWidth={0}>
                  {donut.map((d) => (
                    <Cell key={d.name} fill={d.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <button type="button" onClick={() => setSettingsOpen(true)} aria-label="Budget chart settings" title="Budget chart settings" className="absolute right-0 bottom-0 flex size-8 cursor-pointer items-center justify-center rounded-full border border-line bg-card text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><SettingsIcon /></button>
          </div>
          <div className="text-center">
            <p className="mono m-0 text-[20px] font-semibold tabular-nums">{formatUSD(summaryBudget)}</p>
            <p className="m-0 text-[12px] text-muted-foreground">planned {summaryLabel}</p>
          </div>
        </div>
        {chartView === "month" ? <p className={`m-0 mt-4 text-center text-[12px] ${projectedDifference >= 0 ? "text-muted-foreground" : "text-destructive"}`}>At the current pace, you’re projected to finish {projectedDifference >= 0 ? `${formatUSD(projectedDifference)} under` : `${formatUSD(Math.abs(projectedDifference))} over`} this month’s budget.</p> : null}
      </div>

      <div className="mt-4 rounded-xl border border-line bg-card px-3 py-3">
        <div className="grid h-9 grid-cols-[1.5rem_minmax(0,9rem)_5rem_minmax(0,1fr)_5rem_2.5rem] items-center gap-3 px-3 text-[12px] font-semibold text-foreground">
          <span />
          <button
            type="button"
            onClick={() => setOpenRegular((v) => !v)}
            aria-expanded={openRegular}
            className="flex h-9 min-w-0 cursor-pointer items-center gap-1 rounded text-left text-foreground outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="truncate">Regular categories</span>
            <span aria-hidden="true" className={`inline-flex shrink-0 transition-transform ${openRegular ? "" : "-rotate-90"}`}>
              <FilledChevronDownIcon />
            </span>
          </button>
          <span className="text-right">SPENT</span>
          <span />
          <span className="text-right">BUDGET</span>
          <span />
        </div>
        <AnimatePresence initial={false}>
          {openRegular ? (
            <motion.div key="regular" {...expand} className="overflow-hidden">
              {regular.map((c) => row(c, false))}
            </motion.div>
          ) : null}
        </AnimatePresence>
        {excluded.length > 0 ? (
          <>
            <button
              type="button"
              onClick={() => setOpenExcluded((v) => !v)}
              aria-expanded={openExcluded}
              className="m-0 flex h-9 w-full cursor-pointer items-center gap-1 rounded px-3 text-[12px] font-semibold text-foreground outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              Excluded categories
              <span aria-hidden="true" className={`inline-flex transition-transform ${openExcluded ? "" : "-rotate-90"}`}>
                <FilledChevronDownIcon />
              </span>
            </button>
            <AnimatePresence initial={false}>
              {openExcluded ? (
                <motion.div key="excluded" {...expand} className="overflow-hidden">
                  {excluded.map((c) => row(c, true))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </>
        ) : null}
      </div>
    </div>
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Budget chart settings</DialogTitle><DialogDescription>Choose the time frame used for this budget comparison.</DialogDescription></DialogHeader>
        <div className="grid gap-2"><button type="button" onClick={() => { setChartView("month"); setSettingsOpen(false); }} aria-pressed={chartView === "month"} className={`rounded-lg border p-3 text-left outline-none transition-colors focus-visible:outline-2 focus-visible:outline-ring ${chartView === "month" ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"}`}><span className="block text-[13px] font-medium">This month</span><span className="mt-1 block text-[12px] text-muted-foreground">Compare spending and planned budget for September.</span></button><button type="button" onClick={() => { setChartView("all"); setSettingsOpen(false); }} aria-pressed={chartView === "all"} className={`rounded-lg border p-3 text-left outline-none transition-colors focus-visible:outline-2 focus-visible:outline-ring ${chartView === "all" ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"}`}><span className="block text-[13px] font-medium">All time</span><span className="mt-1 block text-[12px] text-muted-foreground">Compare spending and planned budget across the tracked history.</span></button></div>
      </DialogContent>
    </Dialog>
    </>
  );
}
