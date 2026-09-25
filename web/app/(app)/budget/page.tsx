import { auth } from "@clerk/nextjs/server";
import BudgetView from "@/components/budget-page";

export default async function BudgetPage() {
  await auth.protect();
  return <BudgetView />;
}
