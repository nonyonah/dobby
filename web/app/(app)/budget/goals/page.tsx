import { Suspense } from "react";
import { GoalsSection } from "@/components/goals-section";

export default function BudgetGoalsPage() {
  return (
    <div className="w-full px-6 pt-6 pb-10">
      <Suspense fallback={null}>
        <GoalsSection />
      </Suspense>
    </div>
  );
}
