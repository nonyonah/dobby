"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRightIcon } from "@hugeicons/core-free-icons";
import { PlanProvider, usePlan } from "@/components/plan-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toast";
import { useApi } from "@/hooks/use-api";
import { BrandLogo } from "@/components/ui/brand-logo";

const COUNTRIES = [
  { value: "nigeria", label: "🇳🇬 Nigeria", iso: "NG", currency: "NGN", jurisdiction: "nigeria" },
  { value: "united-states", label: "🇺🇸 United States", iso: "US", currency: "USD", jurisdiction: "united-states" },
];

const controlClass =
  "h-9 w-full rounded-lg border border-input bg-card px-3 text-[13px] text-foreground shadow-[0_0_0_0.5px_rgb(0_0_0/0.09),0_3px_6px_-2px_rgb(0_0_0/0.02),0_1px_1px_rgb(0_0_0/0.04)] outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring border-line bg-muted";

function BrandMark() {
  return <BrandLogo size={34} />;
}

function ProfileStep({ onFinish }: { onFinish: () => void }) {
  const api = useApi();
  const { me, loading: planLoading } = usePlan();
  const { user } = useUser();
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("nigeria");
  const [busy, setBusy] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (prefilled) return;
    if (planLoading) return;
    const saved = [me?.firstName, me?.lastName].filter(Boolean).join(" ");
    // Prefill comes from the async /v1/me payload, so it lands after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFullName(saved || user?.fullName || "");
    if (me?.profile?.country) {
      const match = COUNTRIES.find((entry) => entry.iso === me.profile?.country);
      if (match) setCountry(match.value);
    }
    setPrefilled(true);
  }, [planLoading, me, user, prefilled]);

  const selected = COUNTRIES.find((entry) => entry.value === country) ?? COUNTRIES[0];

  const finish = async () => {
    const parts = fullName.trim().split(/\s+/);
    const firstName = parts[0];
    const lastName = parts.slice(1).join(" ");
    if (!firstName) {
      toast.error("Add your name to continue.");
      return;
    }
    setBusy(true);
    try {
      await api.patch("/v1/me", {
        firstName,
        lastName: lastName || undefined,
        country: selected.iso,
        ...(selected.currency ? { currency: selected.currency } : {}),
        taxJurisdiction: selected.jurisdiction,
        // Saved with the profile rather than in a follow-up call, so the gate
        // cannot bounce the user back here between the two.
        onboarded: true,
      });
      window.localStorage.setItem("dobby-tax-jurisdiction", selected.jurisdiction);
      onFinish();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your profile. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mb-1">
        <h1 className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">Tell us about you</h1>
        <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
          Your country sets the tax jurisdiction Dobby uses for estimates and deadlines.
        </p>
      </div>

      <div className="mt-5 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="onboarding-name" className="block text-[12px] font-medium text-muted-foreground">
            Full name
          </label>
          <Input
            id="onboarding-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="e.g. Ada Lovelace"
            autoComplete="name"
            className={controlClass}
            onKeyDown={(event) => {
              if (event.key === "Enter") void finish();
            }}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="onboarding-country" className="block text-[12px] font-medium text-muted-foreground">
            Country <span className="font-normal text-muted-foreground/80">(for tax jurisdiction)</span>
          </label>
          <NativeSelect
            id="onboarding-country"
            aria-label="Country"
            value={country}
            onValueChange={(value) => setCountry(value ?? "nigeria")}
            options={COUNTRIES.map((entry) => ({ value: entry.value, label: entry.label }))}
          />
        </div>

        {user?.primaryEmailAddress?.emailAddress || me?.email ? (
          <p className="text-[12px] text-muted-foreground">
            Signed in as {user?.primaryEmailAddress?.emailAddress ?? me?.email}
          </p>
        ) : null}
      </div>

      <div className="mt-6 flex items-center justify-end gap-2">
        <Button variant="primary" onClick={() => void finish()} disabled={busy}>
          Continue {busy ? "…" : <HugeiconsIcon icon={ArrowRightIcon}  />}
        </Button>
      </div>
    </>
  );
}

/**
 * One card: name and country.
 *
 * The connections that used to be the second step live in the Get started pill
 * in the top bar, so this screen asks only for what cannot be worked out later
 * and then hands the user to the dashboard. Finishing here is what marks the
 * account onboarded, which is what the gate and the pill both read.
 */
function OnboardingFlow() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { me, loading } = usePlan();

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace("/sign-in");
      return;
    }
    if (loading) return;
    if (me?.onboardedAt) {
      router.replace("/");
    }
  }, [isLoaded, isSignedIn, loading, me, router]);

  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center bg-background px-4 py-10">
      <div className="absolute left-5 top-5 flex items-center gap-2">
        <BrandMark />
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">Dobby</span>
      </div>

      <div className="w-full max-w-[440px]">
        {/* Shown until the profile resolves. A blank page here is what made
            signup look broken on a phone. */}
        {loading ? (
          <div className="space-y-4" role="status" aria-label="Loading">
            <div className="h-40 animate-pulse rounded-2xl bg-muted" />
          </div>
        ) : (
          <Card className="py-0">
            <CardContent className="p-6">
              <ProfileStep onFinish={() => router.replace("/")} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

/** Onboarding: the profile card, then the dashboard where the Get started pill lives. */
export function Onboarding() {
  return (
    <PlanProvider>
      <OnboardingFlow />
    </PlanProvider>
  );
}
