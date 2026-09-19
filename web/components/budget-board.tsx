"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { formatUSD } from "@/lib/format";
import { CATEGORIES } from "@/lib/finance";
import {
  budgetAmount,
  categorySpent,
  type BudgetDef,
} from "@/lib/budgets";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "./ui/chart";
import { FilledChevronDownIcon } from "./icons";

interface BudgetBoardProps {
  budgets: Record<string, BudgetDef>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function BudgetBoard({ budgets, selectedId, onSelect }: BudgetBoardProps) {
  const [openRegular, setOpenRegular] = useState(true);
  const [openExcluded, setOpenExcluded] = useState(false);
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

  const donut = useMemo(
    () => regular.filter((c) => categorySpent(c.id) > 0).map((c) => ({ name: c.name, value: categorySpent(c.id), fill: c.dot })),
    [regular]
  );
  const config = useMemo(
    () => ({ value: { label: "Spent", color: "#4a55c9" } }) satisfies ChartConfig,
    []
  );

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
          selected ? "bg-[#eceefb]/70" : "hover:bg-[#f1efeb] dark:hover:bg-white/[0.06]"
        }`}
      >
        <span aria-hidden="true" className="text-center text-[15px]">
          {c.emoji}
        </span>
        <span className="truncate text-[13px] font-medium text-[#1c1d20] dark:text-[#eceef0]">{c.name}</span>
        <span className={`mono text-right text-[13px] font-medium tabular-nums ${over ? "text-[#F04438]" : "text-[#1c1d20] dark:text-[#eceef0]"}`}>
          {formatUSD(s)}
        </span>
        <span className="min-w-0">
          {isExcluded || amount <= 0 ? (
            <span className="inline-flex rounded-full border border-[#e0ddd7] dark:border-[#2d2d31] bg-[#f1efeb] dark:bg-[#26262a] px-2 py-0.5 text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">
              Excluded
            </span>
          ) : (
            <span className="block h-1.5 w-full overflow-hidden rounded-full bg-[#f1efeb] dark:bg-[#26262a]">
              <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: c.dot }} />
            </span>
          )}
        </span>
        <span className="mono text-right text-[13px] tabular-nums text-[#8a8b91] dark:text-[#a2a3a8]">
          {isExcluded || amount <= 0 ? "—" : formatUSD(amount)}
        </span>
        <span className="flex justify-end">
          {def?.type === "percent" && !isExcluded ? (
            <span className="rounded-full bg-[#eceefb] px-1.5 py-0.5 text-[11px] font-semibold text-[#3a44a8] tabular-nums">
              {def.value}%
            </span>
          ) : null}
        </span>
      </button>
    );
  };

  return (
    <div>
      <div className="rounded-[10px] bg-white dark:bg-[#161617] px-6 py-5 shadow-[0_1px_2px_rgba(23,24,28,0.05),0_4px_16px_rgba(23,24,28,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-center">
            <p className="mono m-0 text-[20px] font-semibold tabular-nums">{formatUSD(spent)}</p>
            <p className="m-0 text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">spent in September</p>
          </div>
          <ChartContainer config={config} className="aspect-square h-[120px] w-[120px] shrink-0">
            <PieChart>
              <Tooltip content={<ChartTooltipContent className="bg-white dark:bg-[#1a1a1d]" formatter={(v) => formatUSD(Number(v))} />} />
              <Pie data={donut} dataKey="value" nameKey="name" innerRadius={36} outerRadius={52} paddingAngle={2} strokeWidth={0}>
                {donut.map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="text-center">
            <p className="mono m-0 text-[20px] font-semibold tabular-nums">{formatUSD(total)}</p>
            <p className="m-0 text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">total budget</p>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[10px] bg-white dark:bg-[#161617] px-3 py-3 shadow-[0_1px_2px_rgba(23,24,28,0.05),0_4px_16px_rgba(23,24,28,0.06)]">
        <div className="grid h-9 grid-cols-[1.5rem_minmax(0,9rem)_5rem_minmax(0,1fr)_5rem_2.5rem] items-center gap-3 px-3 text-[12px] font-semibold text-[#1c1d20] dark:text-[#eceef0]">
          <span />
          <button
            type="button"
            onClick={() => setOpenRegular((v) => !v)}
            aria-expanded={openRegular}
            className="flex h-9 min-w-0 cursor-pointer items-center gap-1 rounded text-left outline-none hover:text-[#1c1d20] focus-visible:outline-2 focus-visible:outline-[#4a55c9]"
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
              className="m-0 flex h-9 w-full cursor-pointer items-center gap-1 rounded px-3 text-[12px] font-semibold text-[#1c1d20] dark:text-[#eceef0] outline-none hover:text-[#1c1d20] focus-visible:outline-2 focus-visible:outline-[#4a55c9]"
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
  );
}
