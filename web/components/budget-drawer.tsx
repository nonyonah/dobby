"use client";

import { useState } from "react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { formatUSD } from "@/lib/format";
import { dayLabel, type TxFull } from "@/lib/transactions";
import {
  budgetAmount,
  budgetStatus,

  FEED_LABEL,
  STATUS_BAR,
  type BudgetDef,
  type FeedKey,
} from "@/lib/budgets";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "./ui/chart";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

import { Button } from "./ui/button";

function useMemoGroups(txns: TxFull[]): { day: string; items: TxFull[] }[] {
  const groups: { day: string; items: TxFull[] }[] = [];
  for (const t of txns) {
    const day = dayLabel(t.date);
    const g = groups.find((x) => x.day === day);
    if (g) g.items.push(t);
    else groups.push({ day, items: [t] });
  }
  return groups;
}
import { CardIcon, ManualIcon, MoreIcon, WalletIcon } from "./icons";

const FEED_ICON: Record<Exclude<FeedKey, "gmail">, (props: { className?: string }) => React.ReactNode> = {
  cards: CardIcon,
  wallets: WalletIcon,
  manual: ManualIcon,
};

const GMAIL_LOGO = "https://www.gstatic.com/images/branding/product/1x/gmail_2020q4_48dp.png";

interface BudgetDrawerProps {
  catId: string;
  budgets: Record<string, BudgetDef>;
  categories: Array<{ id: string; name: string; emoji: string; spent: number; budget: number; dot: string }>;
  onEdit: (catId: string) => void;
  onToggleExclude: (catId: string) => void;
  onDelete: (catId: string) => void;
}

export function BudgetDrawer({ catId, budgets, categories, onEdit, onToggleExclude, onDelete }: BudgetDrawerProps) {
  const [confirming, setConfirming] = useState(false);
  const cat = categories.find((c) => c.id === catId);
  if (!cat) return null;

  const def = budgets[catId];
  const amount = def ? budgetAmount(def) : 0;
  const spent = cat.spent;
  const left = Math.max(0, amount - spent);
  const status = budgetStatus(spent, amount);
  const bars = [{ month: "Current", spent }];
  const year = spent;
  const feeds = { cards: 0, wallets: 0, manual: 0, gmail: 0 };
  const txns: TxFull[] = [];
  const groups = useMemoGroups(txns);
  const excluded = def?.excluded === true;

  const config = { spent: { label: "Spent", color: STATUS_BAR[status] } } satisfies ChartConfig;

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="text-[20px]">{cat.emoji}</span>
          <h2 className="m-0 truncate text-[16px] font-semibold tracking-[-0.01em]">{cat.name}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="secondary" size="small" onClick={() => onEdit(catId)}>
            Edit budget
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${cat.name}`} />
              }
            >
              <MoreIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {confirming ? (
                <>
                  <p className="m-0 px-2 py-1.5 text-[13px] font-medium">Delete {cat.name} budget?</p>
                  <DropdownMenuItem
                    onSelect={() => {
                      onDelete(catId);
                      setConfirming(false);
                    }}
                    className="text-[#b0402f] dark:text-[#e0684f] focus:text-[#b0402f]"
                  >
                    Confirm delete
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setConfirming(false)}>
                    Keep budget
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem onSelect={() => onToggleExclude(catId)}>
                    {excluded ? "Include in budget" : "Move to excluded"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setConfirming(true)} className="text-[#b0402f] dark:text-[#e0684f] focus:text-[#b0402f]">
                    Delete category
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <p className="mono m-0 mt-3 text-[13px] tabular-nums">
        <span className="text-[20px] font-semibold text-[#1c1d20] dark:text-[#eceef0]">{formatUSD(spent)}</span>{" "}
        <span className="text-[#8a8b91] dark:text-[#a2a3a8]">of {formatUSD(amount)} · {formatUSD(left)} left</span>
      </p>

      <ChartContainer config={config} className="aspect-auto h-[130px] w-full">
        <BarChart accessibilityLayer data={bars} margin={{ top: 12, right: 12, left: 4, bottom: 0 }} barCategoryGap="30%">
          <XAxis dataKey="month" tickLine={false} axisLine={false} minTickGap={40} dy={6} tick={{ fill: "var(--chart-tick)", fontSize: 10 }} />
          <YAxis hide />
          <ChartTooltip
            cursor={{ fill: "var(--chart-cursor)", fillOpacity: 0.6 }}
            content={<ChartTooltipContent className="bg-white dark:bg-[#1a1a1d]" formatter={(v) => formatUSD(Number(v))} />}
          />
          <Bar dataKey="spent" fill="var(--color-spent)" radius={[3, 3, 0, 0]} maxBarSize={14} />
        </BarChart>
      </ChartContainer>

      <div className="mt-2 grid grid-cols-2 gap-3 border-y border-soft-line py-2.5">
        <div>
          <p className="m-0 text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">Spent per year</p>
          <p className="mono m-0 text-[13px] font-semibold tabular-nums">{formatUSD(year)}</p>
        </div>
        <div className="text-right">
          <p className="m-0 text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">Avg monthly</p>
          <p className="mono m-0 text-[13px] font-semibold tabular-nums">{formatUSD(Math.round(year / 12))}</p>
        </div>
      </div>

      <p className="m-0 mt-3 mb-1 text-[12px] font-medium text-[#8a8b91] dark:text-[#a2a3a8]">Tracked from</p>
      <ul className="m-0 list-none p-0">
        {(Object.keys(feeds) as FeedKey[]).map((k) => {
          return (
            <li key={k} className="flex items-center gap-2 border-b border-soft-line py-1.5 text-[13px] last:border-b-0">
              <span className="flex size-7 items-center justify-center overflow-hidden rounded-md bg-[#f1efeb] dark:bg-[#26262a] text-[#55565c] dark:text-[#a2a3a8]">
                {k === "gmail" ? (
                  <img src={GMAIL_LOGO} alt="" width={16} height={16} className="size-4" />
                ) : (
                  (() => {
                    const Icon = FEED_ICON[k];
                    return <Icon />;
                  })()
                )}
              </span>
              <span className="flex-1 font-medium">{FEED_LABEL[k]}</span>
              <span className="mono font-medium tabular-nums">{formatUSD(feeds[k])}</span>
            </li>
          );
        })}
      </ul>

      <p className="m-0 mt-3 mb-1 text-[12px] font-medium text-[#8a8b91] dark:text-[#a2a3a8]">September transactions</p>
      {groups.length === 0 ? (
        <p className="m-0 text-[13px] text-[#8a8b91] dark:text-[#a2a3a8]">Nothing tracked here yet.</p>
      ) : (
        groups.map((g) => (
          <div key={g.day}>
            <p className="m-0 mt-2 text-[12px] font-medium text-[#8a8b91] dark:text-[#a2a3a8]">{g.day}</p>
            <ul className="m-0 list-none p-0">
              {g.items.map((t) => (
                <li key={t.id} className="flex items-center gap-2 border-b border-soft-line py-1.5 text-[13px] last:border-b-0">
                  <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                  <span className="mono shrink-0 tabular-nums">{formatUSD(Math.abs(t.amount))}</span>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
