import { formatUSD } from "@/lib/format";
import { BUDGET_LIMIT, CATEGORIES } from "@/lib/finance";
import { Meter, ModuleCard } from "./module-card";

export function BudgetSnapshotCard() {
  const spent = CATEGORIES.reduce((sum, c) => sum + c.spent, 0);

  return (
    <ModuleCard title="Budget snapshot" linkLabel="View all">
      <p className="m-0 text-[13px] font-medium text-[#1c1d20] dark:text-[#eceef0]">
        <span className="mono font-semibold tabular-nums">{formatUSD(spent)}</span>{" "}
        <span className="font-normal text-[#8a8b91] dark:text-[#a2a3a8]">of {formatUSD(BUDGET_LIMIT)} spent</span>
      </p>
      <div className="mt-2">
        <Meter value={(spent / BUDGET_LIMIT) * 100} tone="green" />
      </div>
      <ul className="m-0 mt-1 list-none p-0">
        {CATEGORIES.map((c) => {
          const over = c.spent > c.budget;
          return (
            <li
              key={c.id}
              className="flex items-center gap-2 border-b border-[#f1efeb] dark:border-[#26262a] py-2 text-[13px] last:border-b-0 last:pb-0"
            >
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: c.dot }}
              />
              <span className="min-w-0 flex-1 truncate font-medium text-[#1c1d20] dark:text-[#eceef0]">
                {c.name}
              </span>
              <span className={`mono shrink-0 font-medium tabular-nums ${over ? "text-[#b0402f] dark:text-[#e0684f]" : "text-[#1c1d20] dark:text-[#eceef0]"}`}>
                {formatUSD(c.spent)}
              </span>
              <span className="w-24 shrink-0">
                <Meter value={(c.spent / c.budget) * 100} tone={over ? "red" : "green"} />
              </span>
              <span className="mono w-14 shrink-0 text-right text-[12px] text-[#8a8b91] dark:text-[#a2a3a8] tabular-nums">
                {formatUSD(c.budget)}
              </span>
            </li>
          );
        })}
      </ul>
    </ModuleCard>
  );
}
