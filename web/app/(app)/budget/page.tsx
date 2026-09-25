import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import BudgetView from "@/components/budget-page";
import { FEATURES } from "@/lib/features";

export default async function BudgetPage() {
  if (!FEATURES.budgeting) redirect("/");
  await auth.protect();
  return <BudgetView />;
}
