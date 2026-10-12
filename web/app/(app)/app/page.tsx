import { Dashboard } from "@/components/dashboard";

/**
 * Dashboard index, now at /app. The landing page owns `/` for visitors; the
 * marketing layout bounces signed-in users from `/` here before rendering,
 * and onboarding's post-setup `router.replace("/")` lands on that redirect.
 */
export default function DashboardPage() {
  return <Dashboard />;
}
