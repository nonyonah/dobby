"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { ArrowLeft, ArrowRight, EnvelopeSimple, FileArrowUp, Wallet } from "@phosphor-icons/react/dist/ssr";
import { PlanProvider, usePlan } from "@/components/plan-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toast";
import { useApi } from "@/hooks/use-api";
import { QuickCreateModals } from "@/components/quick-create-modals";
import { WalletConnectModal } from "@/components/settings/wallet-connect-modal";
import { cn } from "cn";
import { guidanceFor, guidanceText } from "@/lib/error-guidance";

const STEP_KEY = "dobby-onboarding-step";

const COUNTRIES = [
  { value: "nigeria", label: "🇳🇬 Nigeria", iso: "NG", currency: "NGN", jurisdiction: "nigeria" },
  { value: "united-states", label: "🇺🇸 United States", iso: "US", currency: "USD", jurisdiction: "united-states" },
];

const controlClass =
  "h-9 w-full rounded-lg border border-input bg-card px-3 text-[13px] text-foreground shadow-[0_0_0_0.5px_rgb(0_0_0/0.09),0_3px_6px_-2px_rgb(0_0_0/0.02),0_1px_1px_rgb(0_0_0/0.04)] outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring dark:border-[#2d2d31] dark:bg-[#232327]";

type Step = 1 | 2;

type Statuses = { statement: boolean; email: boolean; wallet: boolean };

function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="flex size-6 shrink-0 items-center justify-center rounded-[7px] text-[11px] font-bold text-white"
      style={{ background: "var(--accent)" }}
    >
      RL
    </span>
  );
}

function Progress({ step }: { step: Step }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className="flex flex-1 gap-1.5">
        {[1, 2].map((index) => (
          <span
            key={index}
            className={cn("h-1 flex-1 rounded-full transition-colors", index <= step ? "" : "bg-line")}
            style={index <= step ? { background: "var(--accent)" } : undefined}
          />
        ))}
      </div>
      <span className="text-[11px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
        Step {step} of 2
      </span>
    </div>
  );
}

function ProfileStep({ onContinue }: { onContinue: () => void }) {
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

  const continueToConnections = async () => {
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
      });
      window.localStorage.setItem("dobby-tax-jurisdiction", selected.jurisdiction);
      onContinue();
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
              if (event.key === "Enter") void continueToConnections();
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
        <Button variant="primary" onClick={() => void continueToConnections()} disabled={busy}>
          Continue {busy ? "…" : <ArrowRight />}
        </Button>
      </div>
    </>
  );
}

function ConnectStep() {
  const router = useRouter();
  const api = useApi();
  const { plan, loading: planLoading } = usePlan();
  const [statuses, setStatuses] = useState<Statuses | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [connectingEmail, setConnectingEmail] = useState(false);
  const [busy, setBusy] = useState(false);

  const refreshStatuses = async () => {
    try {
      const [imports, integrations, wallets] = await Promise.all([
        api.get<{ data: unknown[] }>("/v1/imports"),
        api.get<{ data: Array<{ status: string }> }>("/v1/integrations"),
        api.get<{ data: unknown[] }>("/v1/wallets"),
      ]);
      setStatuses({
        statement: imports.data.length > 0,
        email: integrations.data.some((item) => item.status === "connected"),
        wallet: wallets.data.length > 0,
      });
    } catch {
      setStatuses({ statement: false, email: false, wallet: false });
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectEmail = async () => {
    setConnectingEmail(true);
    const popup = window.open("about:blank", "dobby-connect", "width=520,height=680");
    try {
      const response = await api.post<{ data: { redirectUrl: string } }>("/v1/integrations/gmail/connect", {});
      if (popup && !popup.closed) {
        popup.location.href = response.data.redirectUrl;
      } else {
        window.location.href = response.data.redirectUrl;
        return;
      }
      for (let attempt = 0; attempt < 40; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        if (popup && popup.closed) break;
        try {
          const status = await api.post<{ data: { status: string } }>("/v1/integrations/gmail/refresh", {});
          if (status.data.status === "connected") break;
        } catch {
          // Keep polling while the popup is open.
        }
      }
      if (popup && !popup.closed) popup.close();
      await refreshStatuses();
      // Kicking off the first sync here means transactions arrive without the
      // user having to find Sync in Settings; failures surface there instead.
      try {
        await api.post<{ data: { jobId: string } }>("/v1/emails/sync", { provider: "gmail" });
        toast.success("Email connected — importing statements, receipts, and bank alerts now.");
      } catch {
        toast.success("Email connected — open Settings and sync to import transactions.");
      }
    } catch (error) {
      const guidance = guidanceFor(error, "email");
      toast.error(guidance.title, { description: guidanceText(guidance) });
    } finally {
      setConnectingEmail(false);
    }
  };

  const finish = async (skipped: boolean) => {
    setBusy(true);
    try {
      await api.patch("/v1/me", { onboarded: true });
    } catch {
      // Never strand the user on onboarding if the final save fails.
    }
    sessionStorage.removeItem(STEP_KEY);
    if (skipped) toast.info("You can connect your data any time from Settings.");
    router.replace("/");
  };

  const rows = [
    {
      id: "statement",
      icon: FileArrowUp,
      title: "Upload a statement",
      description: "Import a bank or wallet statement (CSV, OFX, PDF).",
      done: statuses?.statement ?? false,
      action: () => setImportOpen(true),
    },
    {
      id: "email",
      icon: EnvelopeSimple,
      title: "Connect your email",
      description: "Auto-import transactions from Gmail or Outlook.",
      done: statuses?.email ?? false,
      action: () => void connectEmail(),
      busy: connectingEmail,
    },
    {
      id: "wallet",
      icon: Wallet,
      title: "Add a stablecoin address",
      description: "Track USDC balances and net worth on Base or Solana.",
      done: statuses?.wallet ?? false,
      action: () => setWalletOpen(true),
    },
  ];

  return (
    <>
      <div className="mb-1">
        <h1 className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">Connect your data</h1>
        <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
          Bring in your transactions so Dobby can categorize them. Anything you skip can be added later in Settings.
        </p>
      </div>

      <ul className="mt-5 space-y-2">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={row.action}
              disabled={row.busy || planLoading}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-card px-3.5 py-3 text-left outline-none transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-60"
            >
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground"
                aria-hidden="true"
              >
                <row.icon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-foreground">{row.title}</span>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                      row.busy
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : row.done
                          ? "border-success/40 bg-success-soft text-success"
                          : "border-warning/40 bg-warning-soft text-warning",
                    )}
                  >
                    {row.busy ? "Working…" : row.done ? "Done" : "Pending"}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{row.description}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-faint" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => void finish(true)} disabled={busy || statuses === null}>
          Skip for now
        </Button>
        <Button variant="primary" onClick={() => void finish(false)} disabled={busy || statuses === null}>
          Go to dashboard {busy ? "…" : <ArrowRight />}
        </Button>
      </div>

      {plan === "TRIAL" ? (
        <p className="mt-4 text-center text-[12px] text-muted-foreground">
          Every feature is unlocked during your 7-day free trial — no card required.
        </p>
      ) : null}

      <QuickCreateModals
        kind={importOpen ? "import" : null}
        onClose={() => {
          setImportOpen(false);
          void refreshStatuses();
        }}
      />
      <WalletConnectModal
        open={walletOpen}
        onOpenChange={setWalletOpen}
        onConnected={() => {
          void refreshStatuses();
        }}
      />
    </>
  );
}

function OnboardingFlow() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { me, loading } = usePlan();
  const [step, setStep] = useState<Step | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace("/sign-in");
      return;
    }
    if (loading) return;

    if (me?.onboardedAt) {
      router.replace("/");
      return;
    }
    // Resume where the user left off: profile first, unless it is already saved.
    const stored = sessionStorage.getItem(STEP_KEY);
    const resumeAtStep2 =
      stored === "2" || (stored !== "1" && Boolean(me?.firstName && me.profile?.country));
    // The starting step depends on async profile/onboarding state that only
    // exists once /v1/me resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep(resumeAtStep2 ? 2 : 1);
  }, [isLoaded, isSignedIn, loading, me, router]);

  const goBack = () => {
    sessionStorage.setItem(STEP_KEY, "1");
    setStep(1);
  };

  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center bg-background px-4 py-10">
      <div className="absolute left-5 top-5 flex items-center gap-2">
        <BrandMark />
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">Dobby</span>
      </div>

      <div className="w-full max-w-[440px]">
        {step === null ? (
          <div className="space-y-4" aria-hidden="true">
            <div className="h-40 animate-pulse rounded-2xl bg-muted" />
          </div>
        ) : (
          <>
            {step === 2 ? (
              <button
                type="button"
                onClick={goBack}
                className="mb-3 inline-flex w-fit items-center gap-1.5 text-[12px] text-[#6b6d72] transition-colors hover:text-[#1c1d20] dark:text-[#a2a3a8] dark:hover:text-white"
              >
                <ArrowLeft size={14} /> Back
              </button>
            ) : null}
            <Progress step={step} />
            <Card className="py-0">
              <CardContent className="p-6">
                {step === 1 ? (
                  <ProfileStep
                    onContinue={() => {
                      sessionStorage.setItem(STEP_KEY, "2");
                      setStep(2);
                    }}
                  />
                ) : (
                  <ConnectStep />
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

/** Two-step onboarding: profile (name + tax jurisdiction), then data connections. */
export function Onboarding() {
  return (
    <PlanProvider>
      <OnboardingFlow />
    </PlanProvider>
  );
}
