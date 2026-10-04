import { auth } from "@clerk/nextjs/server";
import { Dashboard } from "@/components/dashboard";

/**
 * Dashboard index, now at /app. The landing page owns `/` for visitors; the
 * marketing layout bounces signed-in users from `/` here before rendering,
 * and onboarding's post-setup `router.replace("/")` lands on that redirect.
 */
export default async function DashboardPage() {
  await auth.protect();
  return <Dashboard />;
}
