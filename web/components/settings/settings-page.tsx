"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertIcon, ArrowRightIcon, BriefcaseIcon, CancelIcon, CloudCheckIcon, CloudDownloadIcon, InformationCircleIcon, LinkIcon, WalletIcon } from "@hugeicons/core-free-icons";
import { Alert, AlertContent, AlertDescription, AlertIndicator, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { ColorSelect } from "@/components/ui/color-select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ACCENT_COLORS, ACCENT_STORAGE_KEY, DEFAULT_ACCENT, THEME_STORAGE_KEY, announceThemeChange, applyAccentColor, applyTheme, isThemePreference, readStoredAccent, withoutTransitions, type AccentColor, type ThemePreference } from "@/lib/theme";
import { readStoredCurrency, setAppCurrency, writeStoredCurrency } from "@/lib/format";
import { useApi } from "@/hooks/use-api";
import { toast } from "@/components/ui/toast";
import { FEATURES } from "@/lib/features";
import { BILLING_COUNTRIES, COUNTRY_OPTIONS, CURRENCIES, CURRENCY_OPTIONS, TAX_JURISDICTION_OPTIONS, TAX_JURISDICTIONS, THEME_OPTIONS } from "@/lib/countries";
import { ChainLogo, chainLabel } from "@/components/ui/chain-logo";
import { deriveBillingNotice } from "@/lib/billing-notice";
import { usePlan } from "@/components/plan-provider";
import { useUpgrade } from "@/components/upgrade";
import { WalletConnectModal } from "./wallet-connect-modal";

// Shadow-as-border: a transparent ring reads as a 1px edge without a hard
// border colour. Dark mode swaps to a single white ring, because layered black
// depth shadows disappear against a dark surface and the inputs lose their edge.
const controlClass = "h-8 w-full rounded-md border-line bg-card px-2.5 text-[13px] text-foreground shadow-[0_0_0_0.5px_rgb(0_0_0/0.09),0_3px_6px_-2px_rgb(0_0_0/0.02),0_1px_1px_rgb(0_0_0/0.04)] transition-shadow duration-150 ease-out focus-visible:border-line focus-visible:ring-0 dark:shadow-[0_0_0_1px_rgb(255_255_255/0.08)]";
// Fills its container rather than shrinking to the widest option. A `w-fit`
// select left a visible gap against the edge of the 220px column every Row
// reserves, which read as a half-empty button.
const selectClass = `${controlClass} pr-8 text-foreground`;
const rowClass = "flex min-h-15 flex-col items-start justify-between gap-3 px-0 py-3.5 sm:flex-row sm:items-center sm:gap-6";

/** Subscription summary returned by `GET /v1/billing`. */
type BillingSubscription = {
  id: string;
  status?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean | null;
};

type BillingTerm = {
  provider: string;
  plan: string;
  periodEndsAt: string | null;
  amount: string;
  currency: string;
};

const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${label.toLowerCase().replaceAll(" ", "-")}-heading`}>
      <h2 id={`${label.toLowerCase().replaceAll(" ", "-")}-heading`} className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </h2>
      <Card className="rounded-2xl border-0 bg-card py-0 shadow-none">
        <CardContent className="divide-y divide-line p-4">{children}</CardContent>
      </Card>
    </section>
  );
}

function Row({ label, description, children, align = "center" }: { label: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; align?: "center" | "start" }) {
  return (
    <div className={`${rowClass} ${align === "start" ? "sm:items-start" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground">{label}</p>
        {description ? <p className="mt-0.5 max-w-[440px] text-[12px] font-medium leading-4 text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex w-full shrink-0 justify-start sm:w-[220px] sm:justify-end">{children}</div>
    </div>
  );
}

/**
 * Stands in for a row whose real value has not arrived yet.
 *
 * Without this the page painted its own defaults — Nigeria, NGN, System — and
 * then swapped them for the saved values a moment later. That read as the page
 * being slow, and worse, it flashed the wrong currency at someone who had just
 * set it to dollars, which is easy to mistake for the setting having reverted.
 * A neutral placeholder is honest about not knowing yet.
 */
function RowPlaceholder({ labelWidth = 92 }: { labelWidth?: number }) {
  return (
    <div className={rowClass} aria-hidden="true">
      <div className="min-w-0 flex-1">
        <span className="block h-[13px] rounded-md bg-muted" style={{ width: labelWidth }} />
      </div>
      <div className="flex w-full shrink-0 justify-start sm:w-[220px] sm:justify-end">
        <span className="block h-7 w-[132px] rounded-md bg-muted" />
      </div>
    </div>
  );
}

function TextField({ id, label, defaultValue, value, onChange, readOnly, type = "text" }: { id: string; label: string; defaultValue?: string; value?: string; onChange?: (value: string) => void; readOnly?: boolean; type?: string }) {
  return (
    <Input
      id={id}
      aria-label={label}
      type={type}
      readOnly={readOnly}
      defaultValue={value === undefined ? defaultValue : undefined}
      value={value}
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      className={controlClass}
    />
  );
}

const BRANDFETCH_LOGO = (domain: string) => `https://cdn.brandfetch.io/domain/${domain}/w/64/h/64?c=${process.env.NEXT_PUBLIC_BRANDFETCH_CLIENT_ID ?? ""}`;

function shortAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function summarizeTransfers(transfers?: Array<{ asset?: string | null; value?: number | string | null }>): string {
  if (!transfers || transfers.length === 0) return "No on-chain activity yet";
  const totals = new Map<string, number>();
  for (const transfer of transfers) {
    const asset = (transfer.asset ?? "UNKNOWN").toUpperCase();
    const value = Number(transfer.value ?? 0);
    if (!Number.isFinite(value)) continue;
    totals.set(asset, (totals.get(asset) ?? 0) + Math.abs(value));
  }
  const stables = ["USDC", "CNGN", "ETH"]
    .filter((asset) => totals.has(asset))
    .map((asset) => `${totals.get(asset)?.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${asset}`);
  const parts = stables.length > 0 ? stables : [`${transfers.length} transfers`];
  return `${transfers.length} transfers · ${parts.slice(0, 2).join(" · ")}`;
}

const PROVIDER_ROWS = [
  { id: "gmail", name: "Gmail", domain: "gmail.com", description: "Import and track transactions from email." },
  { id: "outlook", name: "Outlook", domain: "outlook.com", description: "Import and track transactions from email." },
];

const EMAIL_PROVIDER_IDS = new Set(["gmail", "outlook"]);

function providerLabel(provider: string): string {
  return PROVIDER_ROWS.find((row) => row.id === provider)?.name ?? provider;
}

type EmailImportRow = {
  id: string;
  provider: string;
  subject: string | null;
  fromAddress: string | null;
  receivedAt: string | null;
  kind: string;
  status: string;
  detail: string | null;
  importId: string | null;
};

type SyncJob = {
  status: string;
  scanned: number;
  imported: number;
  duplicates: number;
  duplicateRows: number;
  skipped: number;
  failed: number;
  errorMessage?: string | null;
};

/** `done` is set on a successful sync and cleared after a beat, so the button
 * can acknowledge the result instead of the spinner just stopping. */
type SyncState = {
  busy: boolean;
  summary?: string;
  /** A sync has completed successfully — drives the green state and the checkmark. */
  done?: boolean;
  /** The last attempt failed; the row says so instead of pretending all is well. */
  failed?: boolean;
  /** When the last successful sync finished, for the periodic nudge. */
  lastSyncedAt?: number;
};

const KIND_LABELS: Record<string, string> = { statement: "Statement", receipt: "Receipt", alert: "Bank alert" };

function BrandLogo({ domain }: { domain: string }) {
  const sheetsLogo = domain === "sheets.google.com";
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-secondary p-1.5">
      {sheetsLogo ? (
        <img src="/Google_Sheets_Logo_05.2026.png" alt="" aria-hidden="true" className="size-5 rounded-md object-contain outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10" />
      ) : (
        <img src={BRANDFETCH_LOGO(domain)} alt="" aria-hidden="true" className="size-5 rounded-md object-contain outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10" />
      )}
    </span>
  );
}

function Toggle({ label, description, initial = true }: { label: string; description: string; initial?: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const id = `setting-${label.toLowerCase().replaceAll(" ", "-")}`;
  return <div className={rowClass}>
    <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer"><span className="block text-[13px] font-medium text-foreground">{label}</span><span className="mt-0.5 block text-[12px] font-medium leading-4 text-muted-foreground">{description}</span></label>
    <div className="flex w-full shrink-0 justify-start sm:w-[220px] sm:justify-end">
      <Switch id={id} checked={enabled} onCheckedChange={setEnabled} aria-label={`${label}: ${enabled ? "on" : "off"}`} />
    </div>
  </div>;
}

function SelectField({ id, label, value, options, onValueChange }: { id: string; label: string; value: string; options: Array<{ value: string; label: string }>; onValueChange?: (value: string | null) => void }) {
  return (
    <div className="flex w-full min-w-0 justify-end">
      {/* Native select: the OS picker gives correct flag rendering and
          capitalisation for free, and never traps focus inside a dialog. */}
      <select
        id={id}
        aria-label={label}
        value={value}
        onChange={(event) => onValueChange?.(event.target.value)}
        className={`${selectClass} cursor-pointer appearance-none bg-[length:16px] bg-[right_0.5rem_center] bg-no-repeat pr-8`}
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%238a8b91' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")" }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}


/**
 * Live status dot for an integration row.
 *
 * Colour carries the state, so the buttons below do not have to repeat it:
 * emerald = connected and syncing cleanly, amber = connected but the provider
 * needs attention (expired grant, re-auth), muted = not connected. A dot rather
 * than a filled pill because the provider logo already anchors the row.
 */
function ProviderStatusDot({ state }: { state: ProviderState }) {
  if (state === "disconnected") return null;
  const tone = {
    synced: "bg-success",
    syncing: "bg-accent animate-pulse",
    failed: "bg-danger",
    // Connected but nothing has synced yet: neutral, not claiming health.
    idle: "bg-muted-foreground",
    attention: "bg-warning",
  }[state];
  return <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${tone}`} />;
}

/** One place that turns a provider's raw status plus its sync outcome into a
 *  single state, so the dot, the copy and the button can never disagree. */
type ProviderState = "disconnected" | "idle" | "syncing" | "synced" | "failed" | "attention";

function providerState(connected: boolean, live: boolean, sync: SyncState | undefined): ProviderState {
  if (!connected) return "disconnected";
  if (sync?.busy) return "syncing";
  if (sync?.failed) return "failed";
  if (sync?.done) return "synced";
  if (!live) return "attention";
  return "idle";
}


/** How long the checkmark stays up before the button returns to its idle state. */
const SYNC_DONE_MS = 2600;
/** How long a synced provider stays quiet before we suggest syncing again. */
const SYNC_NUDGE_DAYS = 7;

/** Plain-language line under the provider name. A healthy connection says so and
 *  stops; the suggestion to sync comes back only once a week has passed, because
 *  a standing "you should sync" on a working integration is nagging, not guidance. */
function providerCopy(state: ProviderState, sync: SyncState | undefined, isEmail: boolean, fallback: string) {
  const stale =
    state === "synced" && typeof sync?.lastSyncedAt === "number"
      ? Date.now() - sync.lastSyncedAt > SYNC_NUDGE_DAYS * 24 * 60 * 60 * 1000
      : false;
  switch (state) {
    case "disconnected":
      return fallback;
    case "syncing":
      return "Syncing your inbox for statements, receipts, and bank alerts\u2026";
    case "synced":
      if (stale) return "Connected \u00b7 last synced over a week ago \u2014 sync to pick up anything new";
      return "Connected";
    case "failed":
      return "That sync didn't finish. Try again \u2014 nothing was lost.";
    case "attention":
      return "Connected, but the connection needs attention \u2014 reconnect to resume syncing";
    default:
      return isEmail
        ? "Connected \u2014 sync to import statements, receipts, and bank alerts"
        : "Connected";
  }
}

/**
 * Sync, as a button that reports itself.
 *
 * A spinner alone only says "something is happening" and stops with no signal
 * that it worked — the user has to read the row description to find out. So the
 * glyph carries the whole cycle: the cloud rotates while the job runs, then
 * becomes a cloud-with-check for a beat, tinted success.
 *
 * Icon-only because the label would have to change with the glyph and fight it
 * at 26px. `aria-label` and `title` carry the state for assistive tech and on
 * hover, and the row description still spells the sync out in words underneath.
 *
 * The two glyphs are stacked rather than swapped so the change crossfades —
 * `transition-[transform,opacity]` naming the exact properties, so the colour
 * does not smear along with it.
 */
function SyncButton({
  state,
  providerName,
  onSync,
}: {
  state: SyncState | undefined;
  providerName: string;
  onSync: () => void;
}) {
  const busy = state?.busy === true;
  const done = state?.done === true;
  const label = busy ? `Syncing ${providerName}` : done ? `${providerName} synced` : `Sync ${providerName}`;
  return (
    <Button
      variant="secondary"
      size="icon-sm"
      disabled={busy}
      onClick={onSync}
      aria-label={label}
      title={busy ? "Syncing…" : done ? "Synced" : "Sync"}
      className={cn(done && "text-success")}
    >
      <span className="relative flex size-full items-center justify-center">
        <HugeiconsIcon icon={CloudDownloadIcon}
          aria-hidden="true"
          className={cn(
            "transition-[transform,opacity] duration-150",
            busy ? "animate-spin" : done ? "scale-75 opacity-0" : "scale-100 opacity-100",
          )}
         />
        <HugeiconsIcon icon={CloudCheckIcon} strokeWidth={2}
          aria-hidden="true"
          className={cn(
            "absolute transition-[transform,opacity] duration-150",
            done ? "scale-100 opacity-100" : "scale-75 opacity-0",
          )}
         />
      </span>
    </Button>
  );
}

function AccentColorPicker({ value, onChange }: { value: AccentColor; onChange: (value: AccentColor) => void }) {
  const selected = ACCENT_COLORS.find((color) => color.id === value) ?? ACCENT_COLORS[0];

  return (
    <ColorSelect
      label="Accent"
      value={selected.value}
      onChange={(hex) => {
        const match = ACCENT_COLORS.find((color) => color.value.toLowerCase() === hex.toLowerCase());
        if (match) onChange(match.id);
      }}
      options={ACCENT_COLORS.map((color) => ({ value: color.value, label: color.label }))}
      hideAuto
      // The Row already says "Accent color", so a second label directly above the
      // control just pushed the dropdown out of line with the rows around it.
      hideLabel
      className="w-full"
    />
  );
}

export function SettingsPage() {
  const [wallets, setWallets] = useState<Array<{ id: string; chain: string; address: string; displayName: string; color: string }>>([]);
  const [walletSummaries, setWalletSummaries] = useState<Record<string, string>>({});
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [providers, setProviders] = useState<Record<string, { status: string; live: boolean }>>({});
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<Record<string, SyncState>>({});
  const [duplicateEmails, setDuplicateEmails] = useState<EmailImportRow[]>([]);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  // Which duplicate batch the user has dismissed. Keyed by count, not a bare
  // boolean, so dismissing the current batch does not also hide the next one.
  const [dismissedDuplicates, setDismissedDuplicates] = useState<number | null>(null);
  const [accentColor, setAccentColor] = useState<AccentColor>(DEFAULT_ACCENT);
  const [country, setCountry] = useState("nigeria");
  const [currency, setCurrency] = useState("ngn");
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [jurisdiction, setJurisdiction] = useState("nigeria");
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { plan, isPro, trialEndsAt, me, loading: planLoading, refresh: refreshPlan } = usePlan();
  const trialEndsOn = trialEndsAt
    ? new Date(trialEndsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;
  const [fullName, setFullName] = useState("");
  const { openCheckout, busy: checkoutBusy, refreshOptions } = useUpgrade();
  const [subscription, setSubscription] = useState<BillingSubscription | null>(null);
  const [billingTerm, setBillingTerm] = useState<BillingTerm | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [canceling, setCanceling] = useState(false);
  // Live subscription that has not been set to end: the plan control is then a
  // cancel button, and only reverts to the monthly/annual picker once cancelled.
  const subscribed = Boolean(subscription && !subscription.cancelAtPeriodEnd && subscription.status !== "canceled");
  // Paid Pro by any route: a live Bachs subscription or an unexpired one-time
  // term. Either way the upgrade control morphs into Subscribed + Cancel.
  // The clock is frozen at mount — term boundaries move in days, not seconds.
  const [pageOpenedAt] = useState(() => Date.now());
  const termActive = useMemo(
    () => plan === "ACTIVE" && !subscribed && billingTerm?.periodEndsAt
      ? new Date(billingTerm.periodEndsAt).getTime() > pageOpenedAt
      : false,
    [plan, subscribed, billingTerm, pageOpenedAt],
  );
  const paidPro = subscribed || termActive;

  const billingNotice = useMemo(
    () =>
      deriveBillingNotice({
        plan,
        trialEndsAt,
        subscription,
        billingTerm,
        now: pageOpenedAt,
        formatDate,
      }),
    [plan, trialEndsAt, subscription, billingTerm, pageOpenedAt],
  );

  // Cancelling stops the next renewal only: Bachs keeps Pro running until the
  // period already paid for ends, then sends the webhook that downgrades us.
  const cancelSubscription = async () => {
    setCanceling(true);
    try {
      const response = await api.post<{ data: { cancelAtPeriodEnd?: boolean; currentPeriodEnd?: string | null } }>("/v1/billing/cancel", {});
      setSubscription((current) => (current ? { ...current, ...response.data } : current));
      refreshPlan();
      const until = formatDate(response.data.currentPeriodEnd);
      toast.success(until ? `Subscription canceled — Pro stays on until ${until}.` : "Subscription canceled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel your subscription.");
    } finally {
      setCanceling(false);
      setCancelConfirmOpen(false);
    }
  };

  // Cancelling a one-time term forfeits the remaining days immediately —
  // there is no subscription to stop renewing.
  const cancelTerm = async () => {
    setCanceling(true);
    try {
      await api.post("/v1/billing/term/cancel", {});
      setBillingTerm(null);
      refreshPlan();
      toast.success("Pro ended — you're back on the free view. Nothing was deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not end Pro.");
    } finally {
      setCanceling(false);
      setCancelConfirmOpen(false);
    }
  };

  // Prefills come from the shared /v1/me payload (PlanProvider), so this page
  // never issues its own profile request. The payload lands after mount, so
  // the fields are seeded from it in an effect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFullName([me?.firstName, me?.lastName].filter(Boolean).join(" ") || user?.fullName || "");
    const profile = me?.profile;
    if (!profile) return;
    if (profile.country) setCountry(profile.country.toLowerCase() === "us" ? "united-states" : "nigeria");
    // The saved profile wins whenever it has a currency, but a missing one must
    // not overwrite a choice already made on this device: the country is only a
    // first-run hint. Writing a derived default back is what made Settings
    // appear to forget the change every time it was reopened.
    //
    // Resolve against the currency list rather than testing for USD. Anything the
    // picker cannot represent used to collapse to NGN here *and be written back*,
    // so a profile holding a currency we do not offer — CAD, say — was silently
    // overwritten with NGN on every visit, and the next Save persisted that. It
    // read as "saved, but it went back to naira". An unrecognised stored value is
    // now left alone rather than destroyed.
    const storedCurrency = readStoredCurrency();
    const asOption = (code: string | null | undefined) => {
      if (!code) return null;
      const match = CURRENCIES.find((currency) => currency.code === code.toUpperCase());
      return match ? match.value : null;
    };
    const fromProfile = asOption(profile.currency);
    const fromStorage = asOption(storedCurrency);
    if (fromProfile) {
      setCurrency(fromProfile);
      writeStoredCurrency(fromProfile.toUpperCase());
    } else if (fromStorage) {
      setCurrency(fromStorage);
    } else {
      // First run on this device: the billing country is only a starting guess.
      const seeded = BILLING_COUNTRIES.find((entry) => entry.iso === profile.country?.toUpperCase())?.currency ?? "NGN";
      setCurrency(asOption(seeded) ?? "ngn");
      writeStoredCurrency(seeded);
    }
    if (isThemePreference(profile.theme)) setTheme(profile.theme);
    if (profile.taxJurisdiction && TAX_JURISDICTIONS.some((entry) => entry.value === profile.taxJurisdiction)) setJurisdiction(profile.taxJurisdiction);
    // An accent stored on the account wins, but hex values written before a
    // brand change no longer match any swatch, so fall back to this device's
    // choice rather than snapping the picker back to the default.
    const accent = ACCENT_COLORS.find((item) => item.value.toLowerCase() === profile.accentColor?.toLowerCase());
    setAccentColor(accent?.id ?? readStoredAccent() ?? DEFAULT_ACCENT);
  }, [me, user]);

  const mountedRef = useRef(true);
  const inflightSyncs = useRef(new Set<string>());
  // Pending "synced" timers, one per provider, so a second sync cancels the
  // first one's pending reset instead of leaving a stale checkmark behind.
  const syncDoneTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    mountedRef.current = true;
    // The ref object itself, not `.current`: reading `.current` in a cleanup
    // would look up the map at teardown rather than the one this effect filled.
    const timers = syncDoneTimers;
    return () => {
      mountedRef.current = false;
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    };
  }, []);

  // Poll a sync job to completion and render its outcome. Shared by manual
  // syncs and by resuming an in-flight sync when Settings is reopened, so
  // leaving the page mid-sync never loses the result. Never throws.
  /**
   * Flags a provider as just-synced, then clears the flag so the button returns
   * to its resting glyph. Cleared on unmount too: a timeout that fires after the
   * page is gone would call setState on a dead component.
   */
  const markSyncDone = useCallback((provider: string, summary: string) => {
    setSyncState((prev) => ({ ...prev, [provider]: { busy: false, summary, done: true, lastSyncedAt: Date.now() } }));
    const existing = syncDoneTimers.current.get(provider);
    if (existing) clearTimeout(existing);
    syncDoneTimers.current.set(
      provider,
      setTimeout(() => {
        syncDoneTimers.current.delete(provider);
        setSyncState((prev) => {
          const current = prev[provider];
          if (!current?.done) return prev;
          return { ...prev, [provider]: current.summary === undefined ? { busy: current.busy } : { busy: current.busy, summary: current.summary } };
        });
      }, SYNC_DONE_MS),
    );
  }, []);

  const pollSyncJob = useCallback(async (provider: string, jobId: string) => {
    let job: SyncJob | null = null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        const response = await api.get<{ data: SyncJob }>(`/v1/emails/sync/${jobId}`);
        job = response.data;
      } catch {
        break;
      }
      if (job.status !== "processing") break;
    }
    if (!mountedRef.current) return;
    if (!job || job.status === "processing") {
      setSyncState((prev) => ({ ...prev, [provider]: { busy: false, summary: "Still running — check back in a minute." } }));
      return;
    }
    if (job.status === "failed") {
      setSyncState((prev) => ({ ...prev, [provider]: { busy: false, failed: true } }));
      toast.error(job.errorMessage ?? "The email sync failed.");
      return;
    }
    const parts = [`Scanned ${job.scanned}`, `Imported ${job.imported}`, `Duplicates ${job.duplicates}`];
    if (job.duplicateRows > 0) parts.push(`${job.duplicateRows} duplicate transactions`);
    if (job.failed > 0) parts.push(`${job.failed} failed`);
    let duplicates: EmailImportRow[] = [];
    try {
      duplicates = job.duplicates > 0
        ? (await api.get<{ data: EmailImportRow[] }>("/v1/emails/imports?status=duplicate&take=25")).data
        : [];
    } catch {
      duplicates = [];
    }
    if (!mountedRef.current) return;
    setDuplicateEmails(duplicates);
    markSyncDone(provider, parts.join(" · "));
    toast.success(
      job.imported === 0 && job.duplicates === 0
        ? "Nothing new to import from this inbox."
        : `Imported ${job.imported} email item${job.imported === 1 ? "" : "s"} · ${job.duplicates} duplicate${job.duplicates === 1 ? "" : "s"}`,
    );
  }, [api, markSyncDone]);

  // One watcher per job: manual syncs, mount resumes, and StrictMode
  // double-effects all funnel here without duplicate toasts.
  const finishSync = useCallback(async (provider: string, jobId: string) => {
    const key = `${provider}:${jobId}`;
    if (inflightSyncs.current.has(key)) return;
    inflightSyncs.current.add(key);
    try {
      await pollSyncJob(provider, jobId);
    } finally {
      inflightSyncs.current.delete(key);
    }
  }, [pollSyncJob]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    const load = async () => {
      // Everything below is independent — fetch it in one round trip.
      const [walletResult, providerResult, duplicateResult, jobResult, billingResult] = await Promise.allSettled([
        api.get<{ data: Array<{ id: string; chain: string; address: string; displayName: string; color: string }> }>("/v1/wallets"),
        api.get<{ data: Array<{ provider: string; status: string; live: boolean }> }>("/v1/integrations"),
        api.get<{ data: EmailImportRow[] }>("/v1/emails/imports?status=duplicate&take=25"),
        api.get<{ data: Array<SyncJob & { provider: string; id: string }> }>("/v1/emails/sync"),
        api.get<{ data: { subscription: BillingSubscription | null; term: BillingTerm | null } }>("/v1/billing"),
      ]);
      if (cancelled) return;

      if (walletResult.status === "fulfilled") {
        const walletResponse = walletResult.value;
        setWallets(walletResponse.data);
        void Promise.all(
          walletResponse.data.map(async (wallet) => {
            try {
              const summary = await api.get<{ data: { provider?: string; transfers?: Array<{ asset?: string | null; value?: number | string | null }> } }>(`/v1/wallets/${wallet.id}/summary`);
              if (!cancelled) setWalletSummaries((prev) => ({ ...prev, [wallet.id]: summarizeTransfers(summary.data.transfers) }));
            } catch {
              if (!cancelled) setWalletSummaries((prev) => ({ ...prev, [wallet.id]: "Summary unavailable" }));
            }
          }),
        );
      } else {
        setWallets([]);
      }

      if (providerResult.status === "fulfilled") {
        setProviders(Object.fromEntries(providerResult.value.data.map((item) => [item.provider, { status: item.status, live: item.live }])));
      }

      if (duplicateResult.status === "fulfilled") setDuplicateEmails(duplicateResult.value.data);
      if (billingResult.status === "fulfilled") {
        setSubscription(billingResult.value.data.subscription ?? null);
        setBillingTerm(billingResult.value.data.term ?? null);
      }

      if (jobResult.status === "fulfilled") {
        const latestByProvider = new Map<string, SyncJob & { provider: string; id: string }>();
        for (const job of jobResult.value.data) if (!latestByProvider.has(job.provider)) latestByProvider.set(job.provider, job);
        const summaries: Record<string, SyncState> = {};
        for (const [provider, job] of latestByProvider) {
          if (job.status === "failed") {
            toast.error(job.errorMessage ?? "The last email sync failed.");
            summaries[provider] = { busy: false, summary: "Last sync failed" };
            continue;
          }
          const parts = [`Scanned ${job.scanned}`, `Imported ${job.imported}`, `Duplicates ${job.duplicates}`];
          if (job.duplicateRows > 0) parts.push(`${job.duplicateRows} duplicate transactions`);
          if (job.failed > 0) parts.push(`${job.failed} failed`);
          if (job.status === "processing") {
            summaries[provider] = { busy: true };
            // A sync started earlier (this device or another) is still running
            // server-side — resume watching it so the result lands here.
            void finishSync(provider, job.id);
          } else {
            summaries[provider] = { busy: false, summary: `${parts.join(" · ")}` };
          }
        }
        setSyncState(summaries);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  // Flutterwave returns here after payment (?payment=flutterwave&transaction_id=…&tx_ref=…):
  // verify server-side, then clean the URL so a refresh never re-verifies.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") !== "flutterwave") return;
    const transactionId = params.get("transaction_id") ?? undefined;
    const txRef = params.get("tx_ref") ?? undefined;
    window.history.replaceState(null, "", window.location.pathname);
    void (async () => {
      try {
        const response = await api.post<{ data: { granted?: boolean; already?: boolean } }>("/v1/billing/flutterwave/verify", {
          ...(transactionId ? { transactionId: Number(transactionId) || transactionId } : {}),
          ...(txRef ? { txRef } : {}),
        });
        if (response.data.granted) {
          refreshPlan();
          toast.success(response.data.already ? "Dobby Pro is already active on this payment." : "Payment confirmed — Dobby Pro is active.");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not confirm the payment.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  const refreshProviders = async () => {
    try {
      const providerResponse = await api.get<{ data: Array<{ provider: string; status: string; live: boolean }> }>("/v1/integrations");
      const next = Object.fromEntries(providerResponse.data.map((item) => [item.provider, { status: item.status, live: item.live }]));
      setProviders(next);
      return next;
    } catch {
      // Keep last known statuses.
      return null;
    }
  };

  const syncEmailProvider = async (provider: string) => {
    // Replaces the whole entry rather than merging: a new attempt must clear
    // the previous outcome, or the row keeps showing green or red while it runs.
    setSyncState((prev) => ({ ...prev, [provider]: { busy: true } }));
    try {
      const started = await api.post<{ data: { jobId: string } }>("/v1/emails/sync", { provider });
      await finishSync(provider, started.data.jobId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not sync this inbox.";
      setSyncState((prev) => ({ ...prev, [provider]: { busy: false, failed: true } }));
      toast.error(message);
    }
  };

  const connectProvider = async (provider: string) => {
    if (!isPro) {
      openCheckout();
      return;
    }
    setConnectingProvider(provider);
    // Open synchronously inside the click handler so popup blockers allow it.
    const popup = window.open("about:blank", "dobby-connect", "width=520,height=680");
    try {
      const response = await api.post<{ data: { redirectUrl: string } }>(`/v1/integrations/${provider}/connect`, {});
      if (popup && !popup.closed) {
        popup.location.href = response.data.redirectUrl;
      } else {
        window.location.href = response.data.redirectUrl;
        return;
      }
      for (let attempt = 0; attempt < 40; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        if (!popup || popup.closed) break;
        try {
          const status = await api.post<{ data: { status: string } }>(`/v1/integrations/${provider}/refresh`, {});
          if (status.data.status === "connected") break;
        } catch {
          // Keep polling while the popup is open.
        }
      }
      if (popup && !popup.closed) popup.close();
      const latest = await refreshProviders();
      if (EMAIL_PROVIDER_IDS.has(provider) && latest?.[provider]?.status === "connected") {
        void syncEmailProvider(provider);
      } else {
        toast.success(`${providerLabel(provider)} connected`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not connect ${providerLabel(provider)}.`);
    } finally {
      setConnectingProvider(null);
    }
  };

  const disconnectProvider = async (provider: string) => {
    try {
      await api.delete(`/v1/integrations/${provider}`);
      await refreshProviders();
      toast.success(`${providerLabel(provider)} disconnected`);
    } catch {
      toast.error(`Could not disconnect ${providerLabel(provider)}.`);
    }
  };

  const disconnectWallet = async (id: string) => {
    try {
      await api.delete(`/v1/wallets/${id}`);
      setWallets((prev) => prev.filter((wallet) => wallet.id !== id));
      toast.success("Wallet disconnected");
    } catch {
      toast.error("Could not disconnect this wallet.");
    }
  };

  const handleAccentChange = (next: AccentColor) => {
    setAccentColor(next);
    // An accent swap rewrites a dozen colour variables at once, so it smears
    // for the same reason a theme flip does.
    withoutTransitions(() => applyAccentColor(next));
    window.localStorage.setItem(ACCENT_STORAGE_KEY, next);
  };

  /** Theme, Accent and Currency all apply on change and commit on Save. */
  const handleCurrencyChange = (next: string) => {
    setCurrency(next);
    setAppCurrency(next);
  };

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const saveChanges = async () => {
    setSaving(true);
    try {
      const nameParts = fullName.trim().split(/\s+/);
      await api.patch("/v1/me", {
        ...(nameParts[0] ? { firstName: nameParts[0], lastName: nameParts.slice(1).join(" ") } : {}),
        country: country === "nigeria" ? "NG" : country === "united-states" ? "US" : null,
        currency: currency.toUpperCase(),
        theme,
        taxJurisdiction: jurisdiction,
        accentColor: ACCENT_COLORS.find((item) => item.id === accentColor)?.value,
      });
      try { window.localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* private mode */ }
      announceThemeChange();
      // Theme, Accent and Currency already applied when they were picked, so all
      // that is left is committing them to the account and re-reading it.
      //
      // PlanProvider caches `/v1/me` for the session, and this page re-seeds its
      // form from that payload on mount. Without this the next visit to Settings
      // hydrated from the pre-save profile and put every control back.
      refreshPlan();
      refreshOptions();
      toast.success("Settings saved");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      toast.error("Could not save your settings. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-[680px]">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[18px] font-semibold tracking-[-0.01em] text-foreground">Settings</h1>
            <p className="mt-1 text-[13px] text-ink-500">Manage your account, connections, and finance preferences.</p>
          </div>
          <Button variant="primary" size="small" onClick={saveChanges} disabled={saving}>
            {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
          </Button>
        </header>

        <div className="space-y-5">
          <Section label="Profile">
            {planLoading ? <RowPlaceholder labelWidth={104} /> : (
            <Row label="Full name" description="The name shown on your Dobby workspace."><TextField id="full-name" label="Full name" value={fullName} onChange={setFullName} /></Row>
            )}
            <Row label="Email address" description="Used for account messages and notifications. Managed by your sign-in provider."><TextField id="profile-email" label="Email address" value={user?.primaryEmailAddress?.emailAddress ?? me?.email ?? ""} readOnly type="email" /></Row>
            <Row label="Country" description="Sets your currency and which payment options you see at checkout."><SelectField id="country" label="Country" value={country} onValueChange={(value) => { const next = value ?? "nigeria"; setCountry(next); /* Applying straight away keeps Currency in step with Country instead of waiting for Save and leaving the two controls disagreeing. The currency comes from the billing-country table so the two cannot drift apart. */ const match = BILLING_COUNTRIES.find((entry) => entry.value === next); if (match) handleCurrencyChange(match.currency.toLowerCase()); }} options={COUNTRY_OPTIONS} /></Row>
          </Section>

          <Section label="Connections">
            {wallets.length === 0 ? (
              <Row
                label={<span className="flex items-start gap-2.5"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary"><HugeiconsIcon icon={WalletIcon} size={16}  /></span><span><span className="block">Wallet</span><span className="mt-0.5 block text-[12px] font-medium leading-4 text-muted-foreground">No wallets connected yet</span></span></span>}
              >
                <Button variant="secondary" size="small" onClick={() => (isPro ? setWalletModalOpen(true) : openCheckout())}><HugeiconsIcon icon={LinkIcon}  /> Connect</Button>
              </Row>
            ) : (
              wallets.map((wallet) => (
                <Row
                  key={wallet.id}
                  label={<span className="flex items-start gap-2.5"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-[13px]" style={{ backgroundColor: `${wallet.color}1A` }} aria-hidden="true"><span className="size-2.5 rounded-full" style={{ backgroundColor: wallet.color }} /></span><span><span className="block">{wallet.displayName} <span className="flex items-center gap-1.5 font-normal text-muted-foreground"><span aria-hidden="true">·</span><ChainLogo chain={wallet.chain} className="block size-3.5 shrink-0 rounded-full ring-1 ring-inset ring-foreground/10" />{chainLabel(wallet.chain)}</span></span><span className="mt-0.5 block font-mono text-[12px] font-medium leading-4 text-muted-foreground">{shortAddress(wallet.address)} · {walletSummaries[wallet.id] ?? "Loading activity…"}</span></span></span>}
                >
                  <Button variant="secondary" size="small" onClick={() => void disconnectWallet(wallet.id)}><HugeiconsIcon icon={CancelIcon}  /> Disconnect</Button>
                </Row>
              ))
            )}
            {wallets.length > 0 ? (
              <Row
                label={<span className="flex items-start gap-2.5"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary"><HugeiconsIcon icon={WalletIcon} size={16}  /></span><span><span className="block">Add another wallet</span><span className="mt-0.5 block text-[12px] font-medium leading-4 text-muted-foreground">Base or Solana address with a custom color</span></span></span>}
              >
                <Button variant="secondary" size="small" onClick={() => (isPro ? setWalletModalOpen(true) : openCheckout())}><HugeiconsIcon icon={LinkIcon}  /> Connect</Button>
              </Row>
            ) : null}
            <Row label={<span className="flex items-start gap-2.5"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary"><HugeiconsIcon icon={BriefcaseIcon} size={16}  /></span><span><span className="block">Bank</span><span className="mt-0.5 block text-[12px] font-medium leading-4 text-muted-foreground">Bank connections are planned for a future release.</span></span></span>}><Button variant="secondary" size="small" disabled>Coming soon</Button></Row>
          </Section>

          <Section label="Integrations">
            {duplicateEmails.length > 0 && dismissedDuplicates !== duplicateEmails.length ? (
              /* An alert, not a toast: duplicates were dropped, so this stays
                 until the user reviews them or leaves the page. */
              <Alert status="warning" className="mb-2 gap-2 px-2.5 py-1.5 text-[12px]">
                <AlertIndicator className="[&_svg]:size-3.5">
                  <HugeiconsIcon icon={AlertIcon} strokeWidth={2} size={14}  />
                </AlertIndicator>
                <AlertContent>
                  <AlertTitle className="text-[12px]">
                    {duplicateEmails.length} duplicate {duplicateEmails.length === 1 ? "email was" : "emails were"} skipped
                  </AlertTitle>
                  <AlertDescription className="text-[11px]">Already imported, so they were not added again.</AlertDescription>
                </AlertContent>
                <Button variant="secondary" size="small" onClick={() => setDuplicatesOpen(true)}>Review duplicates</Button>
                {/* Dismissible: the duplicates are already recorded, so re-reading
                    the notice every visit is noise. Review stays one click away
                    from the provider row that imports them. */}
                <button
                  type="button"
                  onClick={() => setDismissedDuplicates(duplicateEmails.length)}
                  aria-label="Dismiss duplicate email notice"
                  className="-mr-1 shrink-0 rounded-md p-1 text-muted-foreground outline-none transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <HugeiconsIcon icon={CancelIcon} strokeWidth={2} size={12}  />
                </button>
              </Alert>
            ) : null}
            {PROVIDER_ROWS.map((row) => {
              const status = providers[row.id]?.status ?? "disconnected";
              const connected = status === "connected";
              const busy = connectingProvider === row.id;
              const sync = syncState[row.id];
              const isEmail = EMAIL_PROVIDER_IDS.has(row.id);
              // `live` is the provider's own signal that the connection still
              // works; connected-but-not-live is the re-auth case.
              const state = providerState(connected, providers[row.id]?.live !== false, sync);
              // A completed sync supersedes the re-auth warning: if we just pulled
              // statements through, the connection is demonstrably working, and
              // leaving "needs attention" under a green row read as a contradiction.
              const description = providerCopy(state, sync, isEmail, row.description);
              return (
                <Row
                  key={row.id}
                  label={<span className="flex items-start gap-2.5"><BrandLogo domain={row.domain} /><ProviderStatusDot state={state} /><span><span className="block">{row.name}</span><span className="mt-0.5 block text-[12px] font-medium leading-4 text-muted-foreground">{description}</span></span></span>}
                >
                  {connected ? (
                    <div className="flex w-full flex-wrap items-center justify-end gap-2">
                      {isEmail ? (
                        <SyncButton state={sync} providerName={row.name} onSync={() => void syncEmailProvider(row.id)} />
                      ) : null}
                      <Button variant="destructive" size="small" onClick={() => void disconnectProvider(row.id)}><HugeiconsIcon icon={CancelIcon}  /> Disconnect</Button>
                    </div>
                  ) : (
                    <Button variant="secondary" size="small" disabled={busy} onClick={() => void connectProvider(row.id)}>
                      {busy ? "Connecting…" : (<><HugeiconsIcon icon={LinkIcon}  /> Connect</>)}
                    </Button>
                  )}
                </Row>
              );
            })}
          </Section>

          <Section label="Notifications">
            <Toggle label="Filing deadline reminders" description="Reminder 30 days before configured filing deadlines." initial={false} />
            {FEATURES.budgeting ? <Toggle label="Budget alerts" description="Alert when a category is approaching its limit." /> : null}
            <Toggle label="Import completed" description="Get notified when a statement has finished processing." />
            <Row
              label="Monthly tax reminders"
              description={isPro ? "Included in your plan — a monthly email with your estimate and outstanding documents." : "Included with Pro — a monthly email with your estimate and outstanding documents."}
            >
              {isPro ? (
                <span className="inline-flex w-fit items-center rounded-full border border-line bg-secondary px-2.5 py-1 text-[12px] font-medium text-muted-foreground">Included in Pro</span>
              ) : (
                <Button variant="secondary" size="small" disabled={checkoutBusy} onClick={() => openCheckout()}>Upgrade</Button>
              )}
            </Row>
          </Section>

          <Section label="Preferences">
            {/* Every control here is prefilled from /v1/me. Showing them before it
                lands means showing a default the user may not have chosen. */}
            {planLoading ? (
              <>
                <RowPlaceholder labelWidth={72} />
                <RowPlaceholder labelWidth={86} />
                <RowPlaceholder labelWidth={64} />
                <RowPlaceholder labelWidth={104} />
              </>
            ) : (
              <>
            <Row label="Theme"><SelectField id="theme" label="Theme" value={theme} onValueChange={(value) => { const next = isThemePreference(value) ? value : "system"; setTheme(next); /* Apply straight away — waiting for Save left the control looking broken. */ try { window.localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* private mode: the save below still persists it */ } applyTheme(next); }} options={THEME_OPTIONS} /></Row>
            <Row label="Accent color"><AccentColorPicker value={accentColor} onChange={handleAccentChange} /></Row>
            <Row label="Currency"><SelectField id="currency" label="Currency" value={currency} onValueChange={(value) => handleCurrencyChange(value ?? "ngn")} options={CURRENCY_OPTIONS} /></Row>
            <Row label="Tax jurisdiction" description="Planning only. Dobby does not prepare or file returns."><SelectField id="jurisdiction" label="Tax jurisdiction" value={jurisdiction} options={TAX_JURISDICTION_OPTIONS} onValueChange={(value) => {
              const next = value ?? "nigeria";
              setJurisdiction(next);
              window.localStorage.setItem("dobby-tax-jurisdiction", next);
            }} /></Row>
              </>
            )}
          </Section>

          <Section label="Categories & rules">
            <Row label="Categorization" description="Keep categorization consistent across new imports."><Link href="/settings/categories-rules" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:text-accent-600">Manage categories and rules <HugeiconsIcon icon={ArrowRightIcon} size={14}  /></Link></Row>
          </Section>

          <Section label="Plan">
            {billingNotice ? (
              <Alert status={billingNotice.status}>
                <AlertIndicator>
                  {billingNotice.status === "danger" ? <HugeiconsIcon icon={AlertIcon} strokeWidth={2}  /> : <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2}  />}
                </AlertIndicator>
                <AlertContent>
                  <AlertTitle>{billingNotice.title}</AlertTitle>
                  <AlertDescription>{billingNotice.body}</AlertDescription>
                </AlertContent>
                <div className="flex shrink-0 gap-2 self-center">
                  {billingNotice.action === "renew" ? (
                    <Button variant="primary" size="small" disabled={checkoutBusy} onClick={() => openCheckout()}>
                      {checkoutBusy ? "Opening checkout…" : "Renew Pro"}
                    </Button>
                  ) : null}
                  <Link href="#plan" className="text-[13px] font-medium text-primary hover:text-accent-600">Plan details</Link>
                </div>
              </Alert>
            ) : null}
            {paidPro ? (
              <Row
                label="Dobby Pro"
                description={
                  subscribed
                    ? subscription?.currentPeriodEnd
                      ? `Billed through Bachs, renews ${formatDate(subscription.currentPeriodEnd)}. Cancelling keeps Pro until then — nothing is deleted.`
                      : "Billed through Bachs. Cancelling keeps Pro until the end of the paid period — nothing is deleted."
                    : billingTerm?.periodEndsAt
                      ? `One-time ${billingTerm.plan === "year" ? "annual" : "monthly"} term — Pro until ${formatDate(billingTerm.periodEndsAt)}. No auto-renew.`
                      : "Dobby Pro is active on a one-time term. No auto-renew."
                }
              >
                <div className="flex shrink-0 gap-2">
                  <Button variant="secondary" size="small" disabled>
                    Subscribed
                  </Button>
                  <Button variant="destructive" size="small" disabled={canceling} onClick={() => setCancelConfirmOpen(true)}>
                    {canceling ? "Canceling…" : "Cancel"}
                  </Button>
                </div>
              </Row>
            ) : (
              <Row
                label="Upgrade to Pro"
                description={
                  subscription?.cancelAtPeriodEnd
                    ? subscription.currentPeriodEnd
                      ? `Your subscription ends ${formatDate(subscription.currentPeriodEnd)} — pick a plan to keep Dobby Pro running.`
                      : "Your subscription has ended — pick a plan to keep Dobby Pro running."
                    : plan === "EXPIRED"
                      ? "Nothing was deleted — upgrade to resume adding transactions, connections, and categorization. Both plans start with a 7-day free trial."
                      : plan === "TRIAL"
                        ? "Keep every feature without interruption when your trial ends. Both plans start with a 7-day free trial."
                        : "Unlocks email auto-fetch, wallet tracking, net worth, proactive flags, and monthly reminders."
                }
              >
                <Button variant="primary" size="small" disabled={checkoutBusy} onClick={() => openCheckout()}>
                  {checkoutBusy ? "Opening checkout…" : "Upgrade to Pro"}
                </Button>
              </Row>
            )}
            <Row
              label="Current plan"
              description={
                plan === "ACTIVE"
                  ? billingTerm?.periodEndsAt
                    ? `Dobby Pro until ${formatDate(billingTerm.periodEndsAt)} (one-time ${billingTerm.plan === "year" ? "annual" : "monthly"} term, no auto-renew).`
                    : subscription?.currentPeriodEnd
                    ? `Dobby Pro — email auto-fetch, wallet tracking, net worth, proactive flags, and monthly tax reminders. Renews ${formatDate(subscription.currentPeriodEnd)}.`
                    : "Dobby Pro — email auto-fetch, wallet tracking, net worth, proactive flags, and monthly tax reminders."
                  : plan === "TRIAL"
                    ? `Free trial — every Pro feature unlocked for 7 days, no card required${trialEndsOn ? `, ending ${trialEndsOn}` : ""}.`
                    : plan === "EXPIRED"
                      ? "Your free trial has ended. Your ledger, history, and past insights are all still here and fully visible."
                      : "Reading your plan…"
              }
            >
              <span
                className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[12px] font-semibold ${
                  plan === "ACTIVE"
                    ? "border-transparent bg-primary text-primary-foreground"
                    : plan === "TRIAL"
                      ? "border-success/40 bg-success-soft text-success"
                      : plan === "EXPIRED"
                        ? "border-warning/40 bg-warning-soft text-warning"
                        : "border-line bg-secondary text-muted-foreground"
                }`}
              >
                {plan === "ACTIVE" ? "Pro" : plan === "TRIAL" ? "Trial" : plan === "EXPIRED" ? "Trial ended" : "…"}
              </span>
            </Row>
          </Section>
        </div>
      </div>
      <Dialog open={duplicatesOpen} onOpenChange={setDuplicatesOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Duplicate emails skipped</DialogTitle>
            <DialogDescription>
              These statements, receipts, and bank alerts had already been imported, so Dobby did not add them again.
            </DialogDescription>
          </DialogHeader>
          <ul className="m-0 max-h-[50vh] list-none space-y-2 overflow-y-auto p-0">
            {duplicateEmails.map((row) => (
              <li key={row.id} className="rounded-lg border border-line px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <p className="m-0 truncate text-[13px] font-medium text-foreground">{row.subject || "(no subject)"}</p>
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{KIND_LABELS[row.kind] ?? row.kind}</span>
                </div>
                <p className="m-0 mt-0.5 truncate text-[12px] text-muted-foreground">
                  {row.fromAddress || "Unknown sender"}{row.receivedAt ? ` · ${new Date(row.receivedAt).toLocaleDateString()}` : ""}
                </p>
                {row.detail ? <p className="m-0 mt-1 text-[12px] text-muted-foreground">{row.detail}</p> : null}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
      <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{subscribed ? "Cancel your subscription?" : "End Pro now?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {subscribed ? (
                subscription?.currentPeriodEnd
                  ? `You keep Dobby Pro until ${formatDate(subscription.currentPeriodEnd)}, then the workspace goes back to view-only. Nothing is deleted — your ledger, history, and insights stay exactly as they are.`
                  : "You keep Dobby Pro until the end of the paid period, then the workspace goes back to view-only. Nothing is deleted — your ledger, history, and insights stay exactly as they are."
              ) : (
                "Your one-time term ends immediately and the workspace goes back to view-only. The remaining days are forfeited — nothing is deleted."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={canceling}>{subscribed ? "Keep subscription" : "Keep Pro"}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={canceling}
              onClick={() => void (subscribed ? cancelSubscription() : cancelTerm())}
            >
              {canceling ? "Canceling…" : subscribed ? "Cancel subscription" : "End Pro now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <WalletConnectModal
        open={walletModalOpen}
        onOpenChange={setWalletModalOpen}
        connectedColors={wallets.map((wallet) => wallet.color)}
        onConnected={(wallet, summary) => {
          setWallets((prev) => [...prev, wallet]);
          setWalletSummaries((prev) => ({
            ...prev,
            [wallet.id]: summary ? summarizeTransfers(summary.transfers) : "Summary unavailable",
          }));
        }}
      />
    </div>
  );
}
