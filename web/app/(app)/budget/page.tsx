import { redirect } from "next/navigation";
import BudgetView from "@/components/budget-page";
import { FEATURES } from "@/lib/features";

export default function BudgetPage() {
  if (!FEATURES.budgeting) redirect("/");
  return <BudgetView />;
}
