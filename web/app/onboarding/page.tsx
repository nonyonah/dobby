import { auth } from "@clerk/nextjs/server";
import { Onboarding } from "@/components/onboarding/onboarding";

export default async function OnboardingPage() {
  await auth.protect();
  return <Onboarding />;
}
