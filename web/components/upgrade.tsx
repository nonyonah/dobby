"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { loadBachs, type Bachs, type BachsCheckoutEvent } from "@bachs/js";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApi } from "@/hooks/use-api";
import { toast } from "@/components/ui/toast";
import { usePlan } from "@/components/plan-provider";
import { guidanceFor, guidanceText } from "@/lib/error-guidance";
import { Banner } from "./ui/banner";

/** The two cadences Dobby Pro is sold on. */
export type BillingInterval = "month" | "year";

/** One priced way to buy Pro. The option travels whole from picker to payment — never re-inferred. */
export type BillingOption = {
  provider: "bachs";
  interval: BillingInterval;
  amount: number;
  currency: string;
  label: string;
  /** Bachs converts to the customer's own currency when the checkout opens. */
  pricing: "local";
};

// Mirrors api/src/lib/bachs.ts SUBSCRIPTION_PRICE_ANCHORS — shown only if
// /v1/billing/options is unreachable. The Bachs catalog product owns the real
// price; these are display anchors.
const FALLBACK_OPTIONS: BillingOption[] = [
  { provider: "bachs", interval: "month", amount: 4, currency: "USD", label: "$4/mo", pricing: "local" },
  { provider: "bachs", interval: "year", amount: 36, currency: "USD", label: "$36/yr", pricing: "local" },
];

function pillPrice(options: BillingOption[], interval: BillingInterval): string {
  const primary = options.find((item) => item.interval === interval);
  if (!primary) return "";
  try {
    const formatted = new Intl.NumberFormat(primary.currency === "NGN" ? "en-NG" : "en-US", {
      style: "currency",
      currency: primary.currency,
      maximumFractionDigits: primary.amount % 1 === 0 ? 0 : 2,
    }).format(primary.amount);
    return `${formatted}/${interval === "month" ? "mo" : "yr"}`;
  } catch {
    return primary.label;
  }
}

type UpgradeContextValue = {
  /** Opens the plan picker dialog. */
  openCheckout: (preset?: BillingInterval) => void;
  /** Starts payment for one explicit option — no inference, no surprises. */
  startCheckout: (option: BillingOption) => void;
  /** True while a checkout is being prepared or is on screen. */
  busy: boolean;
  /** USD anchor prices; Bachs resolves the customer's currency at checkout. */
  options: BillingOption[];
  /** Drop the cached options so the next open re-reads pricing. */
  refreshOptions: () => void;
};

const UpgradeContext = createContext<UpgradeContextValue>({
  openCheckout: () => {},
  startCheckout: () => {},
  busy: false,
  options: FALLBACK_OPTIONS,
  refreshOptions: () => {},
});

/**
 * Owns checkout creation so every upgrade control shares one request path and
 * one busy flag. Upgrade buttons open the picker dialog; the dialog hands one
 * explicit option to `startCheckout`. The checkout opens as an in-page Bachs
 * overlay, so no public return address is needed; webhooks fulfil in every case.
 * Per-country pricing is Bachs' job: the hosted checkout resolves the customer's
 * currency from their location, so no region logic lives here.
 */
export function UpgradeProvider({ children }: { children: React.ReactNode }) {
  const api = useApi();
  const { refresh: refreshPlan } = usePlan();
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<BillingOption[]>(FALLBACK_OPTIONS);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogInterval, setDialogInterval] = useState<BillingInterval>("month");
  const optionsRef = useRef<BillingOption[] | null>(null);
  const bachsRef = useRef<Bachs | null>(null);
  const completedRef = useRef(false);

  // Prices loaded once; USD anchor labels render until then so nothing flashes
  // empty. Bachs swaps in the customer's currency when the checkout opens.
  const ensureOptions = useCallback(async () => {
    if (optionsRef.current) return optionsRef.current;
    try {
      const response = await api.get<{ data: { options: BillingOption[] } }>("/v1/billing/options");
      if (response.data.options.length > 0) {
        optionsRef.current = response.data.options;
        setOptions(response.data.options);
      }
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

  const handleEvent = useCallback(
    (event: BachsCheckoutEvent) => {
      switch (event.type) {
        case "checkout.completed":
          completedRef.current = true;
          toast.success("Payment received — activating Dobby Pro…");
          void confirmSubscription();
          break;
        case "checkout.failed":
          setBusy(false);
          {
            const guidance = guidanceFor(null, "payment");
            toast.error(guidance.title, { description: guidanceText(guidance) });
          }
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
    [confirmSubscription],
  );

  const openCheckout = useCallback(
    (preset: BillingInterval = "month") => {
      if (busy) return;
      // Prices can change (Country setting, catalog edits), so never serve a
      // stale matrix: drop the cache and reload as the dialog opens. The dialog
      // renders fallback prices until the fresh rows land.
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

  /**
   * Loads the SDK once and initialises it once.
   *
   * Bachs' guidance is to initialise when the app loads rather than on every
   * click: the SDK is then already warm when the user reaches the button, and a
   * `checkout.error` has somewhere to go before a checkout is ever opened. The
   * ref also keeps it to a single load under StrictMode's double-mount, which a
   * bare "initialise in an effect" would not.
   */
  const ensureBachs = useCallback(
    async (onEvent: (event: BachsCheckoutEvent) => void) => {
      const existing = bachsRef.current;
      if (existing) return existing;
      const bachs = await loadBachs();
      bachs.Initialize({ onEvent });
      bachsRef.current = bachs;
      return bachs;
    },
    [],
  );

  useEffect(() => {
    // Warm the overlay up front. Failure here is not worth surfacing: the real
    // checkout path re-tries on click and reports properly if it still fails.
    void ensureBachs(handleEvent).catch(() => undefined);
  }, [ensureBachs, handleEvent]);

  const startCheckout = useCallback(
    (option: BillingOption) => {
      if (busy) return;
      setBusy(true);
      completedRef.current = false;
      setDialogOpen(false);
      void (async () => {
        try {
          const response = await api.post<{ data: { url: string } }>("/v1/billing/checkout", {
            interval: option.interval,
          });
          // No baseUrl: a checkout session already carries its own environment,
          // and the full checkout_url says which checkout serves it. The SDK only
          // needs baseUrl for bare tokens, which this integration never uses.
          const bachs = await ensureBachs(handleEvent);
          await bachs.Checkout.open({ checkoutUrl: response.data.url, onEvent: handleEvent });
        } catch (error) {
          setBusy(false);
          const message = error instanceof Error ? error.message : "Could not start checkout.";
          toast.error(message);
        }
      })();
    },
    [api, busy, ensureBachs, handleEvent],
  );

  return (
    <UpgradeContext.Provider value={{ openCheckout, startCheckout, busy, options, refreshOptions }}>
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

/** Plan picker: cadence cards and the terms, nothing else. Mounts fresh per open. */
function CheckoutDialog({ preset, onClose }: { preset: BillingInterval; onClose: () => void }) {
  const { options, busy, startCheckout } = useUpgrade();
  const [interval, setInterval] = useState<BillingInterval>(preset);
  const selected = options.find((option) => option.interval === interval) ?? options[0] ?? null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upgrade to Dobby Pro</DialogTitle>
          <DialogDescription>
            Billed in your local currency via Bachs. Cancel any time — Pro runs until the period you paid for ends.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2" role="group" aria-label="Billing cadence">
          {(["month", "year"] as BillingInterval[]).map((cadence) => (
            <button
              key={cadence}
              type="button"
              onClick={() => setInterval(cadence)}
              aria-pressed={interval === cadence}
              className={`flex-1 cursor-pointer rounded-[10px] border px-3 py-2.5 text-left outline-none transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                interval === cadence ? "border-primary bg-primary/5" : "border-line hover:border-muted-foreground/40"
              }`}
            >
              <span className="block text-[13px] font-semibold capitalize text-foreground">{cadence}ly</span>
              <span className="mono mt-0.5 block text-[12px] tabular-nums text-muted-foreground">
                {pillPrice(options, cadence)}
              </span>
            </button>
          ))}
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
    <div className="px-4 py-3 sm:px-6">
      <Banner
        tone="upgrade"
        title="Your free trial has ended"
        description="Everything you already imported is still here, untouched and fully visible. Upgrade to start adding new data again."
        actions={
          <>
            <Button variant="secondary" size="small" disabled={busy} onClick={() => openCheckout("year")}>
              See annual plans
            </Button>
            <Button variant="primary" size="small" disabled={busy} onClick={() => openCheckout("month")}>
              {busy ? "Opening checkout…" : "Upgrade to Pro"}
            </Button>
          </>
        }
      />
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
