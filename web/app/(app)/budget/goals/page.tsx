import { Suspense } from "react";
import { redirect } from "next/navigation";
import { GoalsSection } from "@/components/goals-section";
import { FEATURES } from "@/lib/features";

export default function BudgetGoalsPage() {
  if (!FEATURES.goals) redirect("/");
  return (
    <div className="w-full px-6 pt-6 pb-10">
      <Suspense fallback={null}>
        <GoalsSection />
      </Suspense>
    </div>
  );
}
