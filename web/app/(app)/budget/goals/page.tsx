import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { GoalsSection } from "@/components/goals-section";

export default async function BudgetGoalsPage() {
  await auth.protect();
  return (
    <div className="w-full px-6 pt-6 pb-10">
      <Suspense fallback={null}>
        <GoalsSection />
      </Suspense>
    </div>
  );
}
