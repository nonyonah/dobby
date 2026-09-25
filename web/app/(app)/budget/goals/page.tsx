import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { GoalsSection } from "@/components/goals-section";
import { FEATURES } from "@/lib/features";

export default async function BudgetGoalsPage() {
  if (!FEATURES.goals) redirect("/");
  await auth.protect();
  return (
    <div className="w-full px-6 pt-6 pb-10">
      <Suspense fallback={null}>
        <GoalsSection />
      </Suspense>
    </div>
  );
}
