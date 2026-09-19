import { IncomeExpensesCard } from "./income-expenses-card";
import { BudgetSnapshotCard } from "./budget-snapshot-card";
import { TransactionsCard } from "./transactions-card";
import { TaxInsightsCard } from "./tax-insights-card";
import { AttentionCard } from "./attention-card";

/**
 * Dashboard content: Copilot-style module grid — income vs expenses,
 * budget snapshot and transactions on the left; tax insights and
 * attention items on the right.
 */
export function Dashboard() {
  return (
    <div className="w-full px-6 pt-6 pb-10">
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <IncomeExpensesCard />
          <BudgetSnapshotCard />
          <TransactionsCard />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <TaxInsightsCard />
          <AttentionCard />
        </div>
      </div>
    </div>
  );
}
