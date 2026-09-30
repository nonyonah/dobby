"use client";

import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IncomeExpensesCard } from "./income-expenses-card";
import { BudgetSnapshotCard } from "./budget-snapshot-card";
import { TransactionsCard } from "./transactions-card";
import { TaxInsightsCard } from "./tax-insights-card";
import { AttentionCard } from "./attention-card";
import { ProactiveFlags } from "./proactive-flags";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { useApi } from "@/hooks/use-api";
import { AGGREGATE_TIMEOUT_MS } from "@/lib/api-client";
import { formatCurrency, getAppCurrency } from "@/lib/format";
import { FEATURES } from "@/lib/features";

type ColumnId = "left" | "right";

/** Dashboard cards the user can toggle. Hidden features are omitted from the list. */
const CUSTOMIZE_CARDS: { id: string; label: string; enabled: boolean }[] = [
  { id: "budget", label: "Budget", enabled: FEATURES.budgeting },
  { id: "transactions", label: "Transactions", enabled: true },
  { id: "tax", label: "Tax insights", enabled: true },
  { id: "attention", label: "Needs attention", enabled: true },
  { id: "flags", label: "Proactive flags", enabled: true },
];

const DEFAULT_COLUMNS: Record<ColumnId, string[]> = {
  left: ["income", "budget", "transactions"],
  right: ["tax", "attention", "flags"],
};

const ORDER_KEY = "dobby-dashboard-columns";

function availableIds(): string[] {
  return ["income", ...CUSTOMIZE_CARDS.filter((card) => card.enabled).map((card) => card.id)];
}

function loadColumns(): Record<ColumnId, string[]> {
  const fallback = () => ({
    left: DEFAULT_COLUMNS.left.filter((id) => availableIds().includes(id)),
    right: DEFAULT_COLUMNS.right.filter((id) => availableIds().includes(id)),
  });
  try {
    const raw = window.localStorage.getItem(ORDER_KEY);
    if (!raw) return fallback();
    const parsed = JSON.parse(raw) as Partial<Record<ColumnId, string[]>>;
    const left = (Array.isArray(parsed.left) ? parsed.left : []).filter((id) => availableIds().includes(id));
    const right = (Array.isArray(parsed.right) ? parsed.right : []).filter((id) => availableIds().includes(id));
    const placed = new Set([...left, ...right]);
    // New cards join the end of the left column instead of vanishing.
    for (const id of availableIds()) if (!placed.has(id)) left.push(id);
    if (left.length === 0 && right.length === 0) return fallback();
    return { left, right };
  } catch {
    return fallback();
  }
}

/** A column is itself droppable so cards can land in an emptied column. */
function DroppableColumn({ id, children }: { id: ColumnId; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} data-column={id} className="flex min-w-0 flex-col gap-4">
      {children}
    </div>
  );
}

function SortableCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
        zIndex: isDragging ? 10 : undefined,
        position: "relative",
        cursor: isDragging ? "grabbing" : "grab",
      }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

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
      .get<{ data: { totalUsd: number } }>("/v1/insights/net-worth", { timeoutMs: AGGREGATE_TIMEOUT_MS })
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
 * Dashboard content: Copilot-style module grid — cards live in two columns
 * you can drag between. Order persists locally; the Customize menu still
 * toggles visibility. Whole-card drag with a small movement threshold so
 * buttons, inputs, and text selection inside cards keep working.
 */
export function Dashboard() {
  const [customize, setCustomize] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [columns, setColumns] = useState<Record<ColumnId, string[]>>(loadColumns);
  const toggle = (id: string) => setHidden((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const visible = (id: string) => !hidden.includes(id);
  const cards = CUSTOMIZE_CARDS.filter((card) => card.enabled);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(ORDER_KEY, JSON.stringify(columns));
    } catch {
      // Private mode — order just doesn't persist.
    }
  }, [columns]);

  const findColumn = (id: string | number): ColumnId | null => {
    const key = String(id);
    if (key === "left" || key === "right") return key;
    if (columns.left.includes(key)) return "left";
    if (columns.right.includes(key)) return "right";
    return null;
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = findColumn(active.id);
    const to = findColumn(over.id);
    if (!from || !to || from === to) return;
    setColumns((prev) => {
      const fromItems = prev[from].filter((id) => id !== String(active.id));
      const overIndex = prev[to].indexOf(String(over.id));
      const toItems = [...prev[to]];
      toItems.splice(overIndex === -1 ? toItems.length : overIndex, 0, String(active.id));
      return { ...prev, [from]: fromItems, [to]: toItems };
    });
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const column = findColumn(active.id);
    if (!column) return;
    if (findColumn(over.id) !== null && findColumn(over.id) !== column) return;
    setColumns((prev) => {
      const items = prev[column];
      const from = items.indexOf(String(active.id));
      const to = items.indexOf(String(over.id));
      if (from === -1 || to === -1 || from === to) return prev;
      return { ...prev, [column]: arrayMove(items, from, to) };
    });
  };

  const renderCard = (id: string) => {
    switch (id) {
      case "income":
        return <IncomeExpensesCard />;
      case "budget":
        return FEATURES.budgeting ? <BudgetSnapshotCard /> : null;
      case "transactions":
        return <TransactionsCard />;
      case "tax":
        return <TaxInsightsCard />;
      case "attention":
        return <AttentionCard />;
      case "flags":
        return <ProactiveFlags />;
      default:
        return null;
    }
  };

  const left = columns.left.filter(visible);
  const right = columns.right.filter(visible);

  return (
    <div className="w-full px-6 pt-6 pb-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <HomeGreeting />
        <Popover open={customize} onOpenChange={setCustomize}><PopoverTrigger render={<Button variant="ghost" size="small" aria-expanded={customize}>Customize</Button>} /><PopoverContent align="end" className="w-52 gap-1 p-1.5"><p className="px-2 py-1 text-[12px] font-medium text-muted-foreground">Dashboard cards</p>{cards.map(({ id, label }) => <button key={id} type="button" aria-pressed={visible(id)} onClick={() => toggle(id)} className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-[13px] hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">{label}<span aria-hidden="true" className={visible(id) ? "text-primary" : "text-muted-foreground"}>{visible(id) ? "✓" : ""}</span></button>)}<div className="my-1 border-t border-soft-line" /><button type="button" onClick={() => setHidden([])} className="w-full rounded-md px-2 py-2 text-left text-[13px] text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">Reset layout</button></PopoverContent></Popover>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <SortableContext items={left} strategy={verticalListSortingStrategy}>
            <DroppableColumn id="left">
              {left.map((id) => <SortableCard key={id} id={id}>{renderCard(id)}</SortableCard>)}
            </DroppableColumn>
          </SortableContext>
          <SortableContext items={right} strategy={verticalListSortingStrategy}>
            <DroppableColumn id="right">
              {right.map((id) => <SortableCard key={id} id={id}>{renderCard(id)}</SortableCard>)}
            </DroppableColumn>
          </SortableContext>
        </div>
      </DndContext>
    </div>
  );
}
