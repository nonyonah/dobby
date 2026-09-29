"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { loadBachs, type Bachs, type BachsCheckoutEvent } from "@bachs/js";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApi } from "@/hooks/use-api";
import { toast } from "@/components/ui/toast";
import { usePlan } from "@/components/plan-provider";

/** The two cadences Dobby Pro is sold on. */
export type BillingInterval = "month" | "year";

/** One priced way to buy Pro. The option travels whole from picker to payment — never re-inferred. */
export type BillingOption = {
  provider: "bachs" | "flutterwave";
  interval: BillingInterval;
  /** Card = Bachs subscription; crypto/Flutterwave = one-time terms. */
  method: "card" | "crypto" | "flutterwave";
  amount: number;
  currency: string;
  label: string;
};

const FALLBACK_OPTIONS: BillingOption[] = [
  { provider: "bachs", interval: "month", method: "card", amount: 5, currency: "USD", label: "$5/mo" },
  { provider: "bachs", interval: "month", method: "crypto", amount: 5, currency: "USD", label: "$5/mo · Crypto" },
  { provider: "bachs", interval: "year", method: "card", amount: 50, currency: "USD", label: "$50/yr" },
  { provider: "bachs", interval: "year", method: "crypto", amount: 50, currency: "USD", label: "$50/yr · Crypto" },
];

const optionKey = (option: BillingOption) => `${option.provider}:${option.interval}:${option.method}`;

function pillPrice(options: BillingOption[], region: "NG" | "US" | null, interval: BillingInterval): string {
  const primary =
    options.find((item) => item.interval === interval && (region === "NG" ? item.provider === "flutterwave" : item.method === "card")) ??
    options.find((item) => item.interval === interval);
  if (!primary) return "";
  try {
    const formatted = new Intl.NumberFormat(primary.currency === "NGN" ? "en-NG" : "en-US", {
      style: "currency",
      currency: primary.currency,
      maximumFractionDigits: 0,
    }).format(primary.amount);
    return `${formatted}/${interval === "month" ? "mo" : "yr"}`;
  } catch {
    return primary.label;
  }
}

function methodCopy(option: BillingOption): { title: string; sub: string } {
  if (option.method === "card") return { title: "Card", sub: "Recurring subscription · 7-day free trial" };
  if (option.method === "crypto") {
    return {
      title: "Crypto",
      sub: `One-time USDT payment · ${option.interval === "month" ? "30 days" : "12 months"} of Pro, no auto-renew`,
    };
  }
  return { title: "Flutterwave", sub: "Card, bank transfer or USSD · one-time, no auto-renew" };
}

type UpgradeContextValue = {
  /** Opens the plan picker dialog. */
  openCheckout: (preset?: BillingInterval) => void;
  /** Starts payment for one explicit option — no inference, no surprises. */
  startCheckout: (option: BillingOption) => void;
  /** True while a checkout is being prepared or is on screen. */
  busy: boolean;
  /** Region-aware prices; USD Bachs until the options load. */
  options: BillingOption[];
  region: "NG" | "US" | null;
  /** Drop the cached options so the next open re-reads the region. */
  refreshOptions: () => void;
};

const UpgradeContext = createContext<UpgradeContextValue>({
  openCheckout: () => {},
  startCheckout: () => {},
  busy: false,
  options: FALLBACK_OPTIONS,
  region: null,
  refreshOptions: () => {},
});

/**
 * Owns checkout creation so every upgrade control shares one request path and
 * one busy flag. Upgrade buttons open the picker dialog; the dialog hands one
 * explicit option to `startCheckout`. Bachs card/crypto open as an in-page
 * overlay (no public return address needed); Flutterwave redirects to its
 * hosted page and verifies on return. Webhooks fulfill in all cases.
 */
export function UpgradeProvider({ children }: { children: React.ReactNode }) {
  const api = useApi();
  const { refresh: refreshPlan } = usePlan();
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<BillingOption[]>(FALLBACK_OPTIONS);
  const [region, setRegion] = useState<"NG" | "US" | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogInterval, setDialogInterval] = useState<BillingInterval>("month");
  const optionsRef = useRef<BillingOption[] | null>(null);
  const bachsRef = useRef<Bachs | null>(null);
  const completedRef = useRef(false);
  const methodRef = useRef<"card" | "crypto">("card");
  const checkoutRef = useRef<string | null>(null);

  // Region-aware prices (NG → Flutterwave NGN + crypto, otherwise Bachs),
  // loaded once; USD Bachs labels render until then so nothing flashes empty.
  const ensureOptions = useCallback(async () => {
    if (optionsRef.current) return optionsRef.current;
    try {
      const response = await api.get<{ data: { region: "NG" | "US"; options: BillingOption[] } }>("/v1/billing/options");
      if (response.data.options.length > 0) {
        optionsRef.current = response.data.options;
        setOptions(response.data.options);
      }
      setRegion(response.data.region);
    } catch {
      // Offline or logged out — keep the USD fallback labels.
    }
    return optionsRef.current ?? FALLBACK_OPTIONS;
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      await ensureOptions();
      if (cancelled) return;
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [ensureOptions]);

  // The browser event is only a UI hint — Bachs' webhook is what activates the
  // plan — so after a completed checkout we poll until the subscription shows.
  const confirmSubscription = useCallback(async () => {
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const billing = await api.get<{ data: { plan?: string; subscription?: unknown } }>("/v1/billing");
        if (billing.data.subscription) {
          refreshPlan();
          setBusy(false);
          toast.success(billing.data.plan === "ACTIVE" ? "Dobby Pro is active" : "Your free trial has started — Dobby Pro is unlocked");
          return;
        }
      } catch {
        // Keep polling; the webhook may still be in flight.
      }
    }
    setBusy(false);
    toast.warning("Your payment is still being confirmed — Pro will activate shortly.");
  }, [api, refreshPlan]);

  // After a crypto checkout completes in-browser, the wallet transfer still
  // needs on-chain confirmations — poll the session until it succeeds, then
  // fulfill the term server-side (the webhook does the same if this misses).
  const confirmCryptoTerm = useCallback(async (checkoutId: string) => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      try {
        const status = await api.post<{ data: { paymentStatus?: string | null; granted?: boolean } }>(
          "/v1/billing/bachs/status",
          { checkoutId },
        );
        if (status.data.granted) {
          refreshPlan();
          setBusy(false);
          toast.success("Payment confirmed — Dobby Pro is active.");
          return;
        }
        if (status.data.paymentStatus && ["failed", "canceled", "expired"].includes(status.data.paymentStatus)) {
          setBusy(false);
          toast.error("The crypto payment didn't complete — your plan is unchanged.");
          return;
        }
      } catch {
        // Keep polling; the transfer may still confirm on-chain.
      }
    }
    setBusy(false);
    toast.warning("Your crypto payment is still confirming — Pro will activate once it lands.");
  }, [api, refreshPlan]);

  const handleEvent = useCallback(
    (event: BachsCheckoutEvent) => {
      switch (event.type) {
        case "checkout.completed":
          completedRef.current = true;
          toast.success("Payment received — activating Dobby Pro…");
          if (methodRef.current === "crypto" && checkoutRef.current) void confirmCryptoTerm(checkoutRef.current);
          else void confirmSubscription();
          break;
        case "checkout.failed":
          setBusy(false);
          toast.error("Payment didn't go through — your plan is unchanged.");
          break;
        case "checkout.expired":
          setBusy(false);
          toast.error("That checkout expired — start again whenever you're ready.");
          break;
        case "checkout.error":
          setBusy(false);
          toast.error(typeof event.data?.message === "string" ? event.data.message : "The checkout could not be opened.");
          break;
        case "checkout.closed":
          setBusy(false);
          // The overlay closes itself right after payment too, so only an
          // early dismissal counts as a cancellation.
          if (!completedRef.current) toast.info("Checkout closed — your trial is unchanged.");
          break;
        default:
          break;
      }
    },
    [confirmCryptoTerm, confirmSubscription],
  );

  const openCheckout = useCallback(
    (preset: BillingInterval = "month") => {
      if (busy) return;
      // The region can change at any time (Country setting), so never serve
      // a stale matrix: drop the cache and reload as the dialog opens. The
      // dialog renders fallback prices until the fresh rows land.
      optionsRef.current = null;
      setDialogInterval(preset);
      setDialogOpen(true);
      void ensureOptions();
    },
    [busy, ensureOptions],
  );

  const refreshOptions = useCallback(() => {
    optionsRef.current = null;
    void ensureOptions();
  }, [ensureOptions]);

  const startCheckout = useCallback(
    (option: BillingOption) => {
      if (busy) return;
      setBusy(true);
      completedRef.current = false;
      methodRef.current = option.method === "crypto" ? "crypto" : "card";
      checkoutRef.current = null;
      setDialogOpen(false);
      void (async () => {
        try {
          if (option.provider === "flutterwave") {
            // One-time NGN term: Flutterwave hosts the whole page, so leave
            // the app; the return URL verifies and the webhook fulfills.
            const response = await api.post<{ data: { link: string } }>("/v1/billing/flutterwave/checkout", {
              interval: option.interval,
            });
            window.location.assign(response.data.link);
            return;
          }
          const response = await api.post<{ data: { url: string; checkoutId?: string } }>("/v1/billing/checkout", {
            interval: option.interval,
            ...(option.method === "crypto" ? { method: "crypto" as const } : {}),
          });
          if (response.data.checkoutId) checkoutRef.current = response.data.checkoutId;
          // Load the script from the same origin that serves this session, so a
          // sandbox checkout talks to the sandbox and live to live.
          const bachs = bachsRef.current ?? (await loadBachs({ baseUrl: new URL(response.data.url).origin }));
          bachsRef.current = bachs;
          bachs.Initialize({ onEvent: handleEvent });
          await bachs.Checkout.open({ checkoutUrl: response.data.url, onEvent: handleEvent });
        } catch (error) {
          setBusy(false);
          const message = error instanceof Error ? error.message : "Could not start checkout.";
          toast.error(message);
        }
      })();
    },
    [api, busy, handleEvent],
  );

  return (
    <UpgradeContext.Provider value={{ openCheckout, startCheckout, busy, options, region, refreshOptions }}>
      {children}
      {dialogOpen ? (
        <CheckoutDialog preset={dialogInterval} onClose={() => setDialogOpen(false)} />
      ) : null}
    </UpgradeContext.Provider>
  );
}

export function useUpgrade() {
  return useContext(UpgradeContext);
}

/** Plan picker: cadence pills, then one row per payment method. Mounts fresh per open. */
function CheckoutDialog({ preset, onClose }: { preset: BillingInterval; onClose: () => void }) {
  const { options, region, busy, startCheckout } = useUpgrade();
  const [interval, setInterval] = useState<BillingInterval>(preset);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const rows = options.filter((option) => option.interval === interval);
  const selected = rows.find((row) => optionKey(row) === selectedKey) ?? rows[0] ?? null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upgrade to Dobby Pro</DialogTitle>
          <DialogDescription>
            {region === "NG"
              ? "Billed in naira via Flutterwave, or once in crypto (USD)."
              : "Billed in USD via Bachs — card subscription or one-time crypto."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2" role="group" aria-label="Billing cadence">
          {(["month", "year"] as BillingInterval[]).map((cadence) => (
            <button
              key={cadence}
              type="button"
              onClick={() => { setInterval(cadence); setSelectedKey(null); }}
              aria-pressed={interval === cadence}
              className={`flex-1 cursor-pointer rounded-xl border px-3 py-2.5 text-left outline-none transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                interval === cadence ? "border-primary bg-primary/5" : "border-line hover:border-muted-foreground/40"
              }`}
            >
              <span className="block text-[13px] font-semibold capitalize text-foreground">{cadence}ly</span>
              <span className="mono mt-0.5 block text-[12px] tabular-nums text-muted-foreground">
                {pillPrice(options, region, cadence)}
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Payment method">
          {rows.map((option) => {
            const copy = methodCopy(option);
            const active = selected?.provider === option.provider && selected?.method === option.method;
            return (
              <button
                key={optionKey(option)}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSelectedKey(optionKey(option))}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left outline-none transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                  active ? "border-primary bg-primary/5" : "border-line hover:border-muted-foreground/40"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${
                    active ? "border-primary" : "border-muted-foreground/40"
                  }`}
                >
                  {active ? <span className="size-2 rounded-full bg-primary" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-foreground">{copy.title}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">{copy.sub}</span>
                </span>
                <span className="mono shrink-0 text-[13px] font-semibold tabular-nums text-foreground">{option.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="small" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="small" disabled={busy || !selected} onClick={() => { if (selected) startCheckout(selected); }}>
            {busy ? "Opening…" : "Continue"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Persistent, non-punishing prompt shown once a trial lapses: every existing
 * record stays visible, so the banner only says what resumed and offers both
 * ways back in.
 */
export function TrialExpiredBanner() {
  const { expired } = usePlan();
  const { openCheckout, busy } = useUpgrade();
  if (!expired) return null;

  return (
    <div className="border-b border-warning/40 bg-warning-soft px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-[760px] text-[13px] leading-5 text-foreground">
          Your free trial has ended — everything you already imported is still here, untouched and fully visible. Upgrade to start adding new data again.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="small" disabled={busy} onClick={() => openCheckout("year")}>
            See annual plans
          </Button>
          <Button variant="primary" size="small" disabled={busy} onClick={() => openCheckout("month")}>
            {busy ? "Opening checkout…" : "Upgrade to Pro"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Opens the hosted Bachs portal where a Pro subscriber can change or cancel. */
async function openPortal(api: ReturnType<typeof useApi>) {
  try {
    const response = await api.post<{ data: { url: string } }>("/v1/billing/portal", {});
    window.location.assign(response.data.url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not open billing settings.";
    toast.error(message);
  }
}

/**
 * Inline upgrade prompt for sections an expired account cannot use yet. Keeps the
 * control visible and clickable instead of hiding Pro features from the UI.
 */
export function UpgradeCard({
  feature,
  title,
  description,
  className = "",
}: {
  feature: string;
  title?: string;
  description?: string;
  className?: string;
}) {
  const { openCheckout, busy } = useUpgrade();

  return (
    <Card className={`border-0 shadow-[0_0_0_0.5px_rgb(0_0_0/0.09),0_3px_6px_-2px_rgb(0_0_0/0.02),0_1px_1px_rgb(0_0_0/0.04)] ${className}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-primary">
              Pro
            </span>
            <p className="m-0 mt-2 text-[13px] font-medium text-foreground">{title ?? `Unlock ${feature}`}</p>
            <p className="m-0 mt-1 max-w-[440px] text-[12px] leading-4 text-muted-foreground">
              {description ?? `${feature} is part of Dobby Pro. Your ledger, history, and past insights stay visible either way — upgrade to turn this back on.`}
            </p>
          </div>
          <Button variant="primary" size="small" className="shrink-0" disabled={busy} onClick={() => openCheckout()}>
            {busy ? "Opening…" : "Upgrade"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export { openPortal };
