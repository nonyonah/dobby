import { formatUSD } from "@/lib/format";
import { CATEGORY_SERIES, SOURCE_SERIES } from "@/lib/insights-data";
import { TRANSACTIONS_FULL } from "@/lib/transactions";
import { SOURCE_COLOR_MAP } from "@/lib/cashflow";
import { BreakdownPie } from "./breakdown-pie";
import { FlowTable } from "./flow-table";
import { FlowNarrative } from "./flow-narrative";

const MONTHS = [
  { value: 0, label: "January" },
  { value: 1, label: "February" },
  { value: 2, label: "March" },
  { value: 3, label: "April" },
  { value: 4, label: "May" },
  { value: 5, label: "June" },
  { value: 6, label: "July" },
  { value: 7, label: "August" },
  { value: 8, label: "September" },
];

function monthTxns(month: number, income: boolean) {
  const prefix = `2026-${String(month + 1).padStart(2, "0")}`;
  return TRANSACTIONS_FULL.filter(
    (t) => t.date.startsWith(prefix) && (income ? t.amount >= 0 : t.amount < 0)
  ).sort((a, b) => (a.date < b.date ? 1 : -1));
}

function momDelta(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export function SpendingSection({ month, onMonthChange }: { month: number; onMonthChange: (m: number) => void }) {
  const items = CATEGORY_SERIES.map((c) => ({
    id: c.id,
    name: c.name,
    amount: c.monthly[month] ?? 0,
    color: c.dot,
  })).filter((i) => i.amount > 0);
  const total = items.reduce((s, i) => s + i.amount, 0);
  const prev = CATEGORY_SERIES.reduce((s, c) => s + (c.monthly[month - 1] ?? 0), 0);
  const d = month > 0 ? momDelta(total, prev) : null;
  const top = [...items].sort((a, b) => b.amount - a.amount)[0];
  const rows = monthTxns(month, false);

  return (
    <div className="flex flex-col gap-4">
      <BreakdownPie
        title="Spending by category"
        items={items}
        month={month}
        months={MONTHS}
        onMonthChange={onMonthChange}
      />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <FlowTable title="Transactions" typeLabel="Spending" filterLabel="All categories" rows={rows} />
        </div>
        <FlowNarrative title="Spending summary">
          <p className="m-0">
            You spent <strong>{formatUSD(total)}</strong>
            {d !== null ? (
              <>, {d <= 0 ? "down" : "up"} {Math.abs(d).toFixed(0)}% from last month</>
            ) : (
              <> this month</>
            )}
            .
          </p>
          {top ? (
            <p className="m-0">
              <strong>{top.name}</strong> led at {formatUSD(top.amount)} —{" "}
              {total > 0 ? Math.round((top.amount / total) * 100) : 0}% of everything out.
            </p>
          ) : null}
        </FlowNarrative>
      </div>
    </div>
  );
}

export function IncomeSection({ month, onMonthChange }: { month: number; onMonthChange: (m: number) => void }) {
  const items = SOURCE_SERIES.map((s) => ({
    id: s.id,
    name: s.name,
    amount: s.monthly[month] ?? 0,
    color: SOURCE_COLOR_MAP[s.id] ?? "#8a8b91",
  })).filter((i) => i.amount > 0);
  const total = items.reduce((s, i) => s + i.amount, 0);
  const prev = SOURCE_SERIES.reduce((s, x) => s + (x.monthly[month - 1] ?? 0), 0);
  const d = month > 0 ? momDelta(total, prev) : null;
  const top = [...items].sort((a, b) => b.amount - a.amount)[0];
  const rows = monthTxns(month, true);

  return (
    <div className="flex flex-col gap-4">
      <BreakdownPie
        title="Income by source"
        items={items}
        month={month}
        months={MONTHS}
        onMonthChange={onMonthChange}
      />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <FlowTable title="Transactions" typeLabel="Income" filterLabel="All sources" rows={rows} income />
        </div>
        <FlowNarrative title="Income summary">
          <p className="m-0">
            <strong>{formatUSD(total)}</strong> came in
            {d !== null ? (
              <>, {d >= 0 ? "up" : "down"} {Math.abs(d).toFixed(0)}% from last month</>
            ) : null}
            .
          </p>
          {top ? (
            <p className="m-0">
              <strong>{top.name}</strong> carried it with {formatUSD(top.amount)} —{" "}
              {total > 0 ? Math.round((top.amount / total) * 100) : 0}% of everything in.
            </p>
          ) : null}
        </FlowNarrative>
      </div>
    </div>
  );
}
