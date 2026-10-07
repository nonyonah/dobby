import { auth } from "@clerk/nextjs/server";
import { AppShell } from "@/components/app-shell";
import { PlanProvider } from "@/components/plan-provider";
import { OnboardingGate } from "@/components/onboarding/onboarding-gate";
import { UpgradeProvider } from "@/components/upgrade";
import { UserbackIdentify } from "@/components/userback";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await auth.protect();
  return (
    <PlanProvider>
      <OnboardingGate>
        <UpgradeProvider>
          {/* Route-level usage only, and only after consent. */}
          <UserbackIdentify />
          <AppShell>{children}</AppShell>
        </UpgradeProvider>
      </OnboardingGate>
    </PlanProvider>
  );
}
