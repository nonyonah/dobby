import { auth } from "@clerk/nextjs/server";
import InsightsView from "@/components/insights-page";

export default async function InsightsPage() {
  await auth.protect();
  return <InsightsView />;
}
