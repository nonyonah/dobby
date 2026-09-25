"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { ArrowRight, Briefcase, CloudArrowDown, LinkSimple, Wallet, X } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ACCENT_COLORS, ACCENT_STORAGE_KEY, DEFAULT_ACCENT, applyAccentColor, type AccentColor } from "@/lib/theme";
import { useApi } from "@/hooks/use-api";
import { toast } from "@/components/ui/toast";
import { FEATURES } from "@/lib/features";
import { WalletConnectModal } from "./wallet-connect-modal";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const controlClass = "h-8 w-full rounded-lg border-[#e9e7e2] bg-white px-2.5 text-[13px] text-foreground shadow-[0_0_0_0.5px_rgb(0_0_0/0.09),0_3px_6px_-2px_rgb(0_0_0/0.02),0_1px_1px_rgb(0_0_0/0.04)] focus-visible:border-[#e0ddd7] focus-visible:ring-0 dark:border-[#2d2d31] dark:bg-[#232327]";
const selectClass = `${controlClass.replace("w-full", "w-fit min-w-0")} pr-8 text-[#2C2D2F] dark:text-[#eceef0]`;
const rowClass = "flex min-h-15 flex-col items-start justify-between gap-3 px-0 py-3.5 sm:flex-row sm:items-center sm:gap-6";

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${label.toLowerCase().replaceAll(" ", "-")}-heading`}>
      <h2 id={`${label.toLowerCase().replaceAll(" ", "-")}-heading`} className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </h2>
      <Card className="rounded-2xl border-0 bg-card py-0 shadow-[0_0_0_0.5px_rgb(0_0_0/0.09),0_3px_6px_-2px_rgb(0_0_0/0.02),0_1px_1px_rgb(0_0_0/0.04)]">
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

function TextField({ id, label, defaultValue, type = "text" }: { id: string; label: string; defaultValue: string; type?: string }) {
  return <Input id={id} aria-label={label} type={type} defaultValue={defaultValue} className={controlClass} />;
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

type SyncState = { busy: boolean; summary?: string };

const KIND_LABELS: Record<string, string> = { statement: "Statement", receipt: "Receipt", alert: "Bank alert" };

function BrandLogo({ domain }: { domain: string }) {
  const sheetsLogo = domain === "sheets.google.com";
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-secondary p-1.5">
      {sheetsLogo ? (
        <img src="/Google_Sheets_Logo_05.2026.png" alt="" aria-hidden="true" className="size-5 rounded-md object-contain" />
      ) : (
        <img src={BRANDFETCH_LOGO(domain)} alt="" aria-hidden="true" className="size-5 rounded-md object-contain" />
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
    <div className="flex justify-end">
      <Select className="w-fit" value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id} aria-label={label} className={selectClass}><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}


function AccentColorPicker({ value, onChange }: { value: AccentColor; onChange: (value: AccentColor) => void }) {
  const [open, setOpen] = useState(false);
  const selected = ACCENT_COLORS.find((color) => color.id === value) ?? ACCENT_COLORS[0];

  return (
    <>
      <button
        type="button"
        aria-label={`Accent color: ${selected.label}`}
        title={selected.label}
        onClick={() => setOpen(true)}
        className="size-7 cursor-pointer rounded-full border border-black/10 shadow-[0_0_0_0.5px_rgb(0_0_0/0.09),0_1px_2px_rgb(0_0_0/0.12)] outline-none transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
        style={{ backgroundColor: selected.value }}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Accent color</DialogTitle>
            <DialogDescription>Choose an accent for interactive elements across Dobby.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-3" role="radiogroup" aria-label="Accent colors">
            {ACCENT_COLORS.map((color) => (
              <button
                key={color.id}
                type="button"
                role="radio"
                aria-checked={value === color.id}
                aria-label={color.label}
                title={color.label}
                onClick={() => {
                  onChange(color.id);
                  setOpen(false);
                }}
                className={`flex size-12 cursor-pointer items-center justify-center rounded-full border outline-none transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 ${value === color.id ? "border-foreground" : "border-transparent"}`}
              >
                <span className="size-8 rounded-full shadow-[0_0_0_0.5px_rgb(0_0_0/0.1),0_1px_2px_rgb(0_0_0/0.12)]" style={{ backgroundColor: color.value }} />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
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
  const [accentColor, setAccentColor] = useState<AccentColor>(DEFAULT_ACCENT);
  const [country, setCountry] = useState("nigeria");
  const [currency, setCurrency] = useState("ngn");
  const [theme, setTheme] = useState("system");
  const [jurisdiction, setJurisdiction] = useState("nigeria");
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    void api.get<{ data: { profile?: { country?: string | null; currency?: string; theme?: string | null; taxJurisdiction?: string | null; accentColor?: string | null } | null } }>("/v1/me").then((response) => {
      const profile = response.data.profile;
      if (!profile) return;
      if (profile.country) setCountry(profile.country.toLowerCase() === "ng" ? "nigeria" : profile.country.toLowerCase() === "us" ? "united-states" : "other");
      if (profile.currency) {
        setCurrency(profile.currency.toLowerCase());
        window.localStorage.setItem("dobby-currency", profile.currency.toUpperCase());
      } else if (profile.country?.toUpperCase() === "NG") {
        setCurrency("ngn");
        window.localStorage.setItem("dobby-currency", "NGN");
      } else if (profile.country?.toUpperCase() === "US") {
        setCurrency("usd");
        window.localStorage.setItem("dobby-currency", "USD");
      }
      if (profile.theme) setTheme(profile.theme);
      if (profile.taxJurisdiction) setJurisdiction(profile.taxJurisdiction);
      const accent = ACCENT_COLORS.find((item) => item.value.toLowerCase() === profile.accentColor?.toLowerCase());
      if (accent) setAccentColor(accent.id);
    }).catch(() => {
      // Keep local defaults when the API is unavailable.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    const load = async () => {
      try {
        const walletResponse = await api.get<{ data: Array<{ id: string; chain: string; address: string; displayName: string; color: string }> }>("/v1/wallets");
        if (cancelled) return;
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
      } catch {
        if (!cancelled) setWallets([]);
      }
      try {
        const providerResponse = await api.get<{ data: Array<{ provider: string; status: string; live: boolean }> }>("/v1/integrations");
        if (!cancelled) {
          setProviders(Object.fromEntries(providerResponse.data.map((item) => [item.provider, { status: item.status, live: item.live }])));
        }
      } catch {
        // Provider rows fall back to disconnected until the API responds.
      }
      try {
        const duplicates = await api.get<{ data: EmailImportRow[] }>("/v1/emails/imports?status=duplicate&take=25");
        if (!cancelled) setDuplicateEmails(duplicates.data);
      } catch {
        // The duplicate notice only appears once email sync has run.
      }
      try {
        const jobs = await api.get<{ data: Array<SyncJob & { provider: string; id: string }> }>("/v1/emails/sync");
        if (!cancelled) {
          const latestByProvider = new Map<string, SyncJob>();
          for (const job of jobs.data) if (!latestByProvider.has(job.provider)) latestByProvider.set(job.provider, job);
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
            summaries[provider] = job.status === "processing"
              ? { busy: true }
              : { busy: false, summary: `${parts.join(" · ")}` };
          }
          setSyncState(summaries);
        }
      } catch {
        // Sync status stays empty until the first run.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
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
    setSyncState((prev) => ({ ...prev, [provider]: { busy: true } }));
    try {
      const started = await api.post<{ data: { jobId: string } }>("/v1/emails/sync", { provider });
      let job: SyncJob | null = null;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const response = await api.get<{ data: SyncJob }>(`/v1/emails/sync/${started.data.jobId}`);
        job = response.data;
        if (job.status !== "processing") break;
      }
      if (!job || job.status === "processing") throw new Error("The email sync is still running. Check back in a minute.");
      if (job.status === "failed") throw new Error(job.errorMessage ?? "The email sync failed.");

      const parts = [`Scanned ${job.scanned}`, `Imported ${job.imported}`, `Duplicates ${job.duplicates}`];
      if (job.duplicateRows > 0) parts.push(`${job.duplicateRows} duplicate transactions`);
      if (job.failed > 0) parts.push(`${job.failed} failed`);
      const summary = parts.join(" · ");

      const duplicates = job.duplicates > 0
        ? (await api.get<{ data: EmailImportRow[] }>("/v1/emails/imports?status=duplicate&take=25")).data
        : [];
      setDuplicateEmails(duplicates);
      setSyncState((prev) => ({ ...prev, [provider]: { busy: false, summary } }));
      toast.success(
        job.imported === 0 && job.duplicates === 0
          ? "Nothing new to import from this inbox."
          : `Imported ${job.imported} email item${job.imported === 1 ? "" : "s"} · ${job.duplicates} duplicate${job.duplicates === 1 ? "" : "s"}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not sync this inbox.";
      setSyncState((prev) => ({ ...prev, [provider]: { busy: false } }));
      toast.error(message);
    }
  };

  const connectProvider = async (provider: string) => {
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

  const handleAccentChange = (next: AccentColor) => {    setAccentColor(next);
    applyAccentColor(next);
    window.localStorage.setItem(ACCENT_STORAGE_KEY, next);
  };

  const saveChanges = async () => {
    try {
      await api.patch("/v1/me", {
        country: country === "nigeria" ? "NG" : country === "united-states" ? "US" : null,
        currency: currency.toUpperCase(),
        theme,
        taxJurisdiction: jurisdiction,
        accentColor: ACCENT_COLORS.find((item) => item.id === accentColor)?.value,
      });
      window.localStorage.setItem("dobby-currency", currency.toUpperCase());
      window.dispatchEvent(new CustomEvent("dobby-currency-change", { detail: currency.toUpperCase() }));
      toast.success("Settings saved");
    } catch {
      toast.error("Could not save your settings. Try again.");
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
          <Button variant="primary" size="small" onClick={saveChanges}>
            Save changes
          </Button>
        </header>

        <div className="space-y-5">
          <Section label="Profile">
            <Row label="Full name" description="The name shown on your Dobby workspace."><TextField id="full-name" label="Full name" defaultValue="Ada Lovelace" /></Row>
            <Row label="Email address" description="Used for account messages and notifications."><TextField id="profile-email" label="Email address" defaultValue="ada@riftlabs.co" type="email" /></Row>
            <Row label="Country"><SelectField id="country" label="Country" value={country} onValueChange={(value) => { const next = value ?? "nigeria"; setCountry(next); if (next === "nigeria") setCurrency("ngn"); if (next === "united-states") setCurrency("usd"); if (next === "ghana") setCurrency("ghs"); if (next === "kenya") setCurrency("kes"); }} options={[{ value: "nigeria", label: "🇳🇬 Nigeria" }, { value: "united-states", label: "🇺🇸 United States" }, { value: "ghana", label: "🇬🇭 Ghana" }, { value: "kenya", label: "🇰🇪 Kenya" }, { value: "other", label: "🌐 Other" }]} /></Row>
          </Section>

          <Section label="Connections">
            {wallets.length === 0 ? (
              <Row
                label={<span className="flex items-start gap-2.5"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary"><Wallet size={16} /></span><span><span className="block">Wallet</span><span className="mt-0.5 block text-[12px] font-medium leading-4 text-muted-foreground">No wallets connected yet</span></span></span>}
              >
                <Button variant="secondary" size="small" onClick={() => setWalletModalOpen(true)}><LinkSimple /> Connect</Button>
              </Row>
            ) : (
              wallets.map((wallet) => (
                <Row
                  key={wallet.id}
                  label={<span className="flex items-start gap-2.5"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-[13px]" style={{ backgroundColor: `${wallet.color}1A` }} aria-hidden="true"><span className="size-2.5 rounded-full" style={{ backgroundColor: wallet.color }} /></span><span><span className="block">{wallet.displayName} <span className="font-normal text-muted-foreground">· {wallet.chain === "BASE" ? "Base" : "Solana"}</span></span><span className="mt-0.5 block font-mono text-[12px] font-medium leading-4 text-muted-foreground">{shortAddress(wallet.address)} · {walletSummaries[wallet.id] ?? "Loading activity…"}</span></span></span>}
                >
                  <Button variant="secondary" size="small" onClick={() => void disconnectWallet(wallet.id)}><X /> Disconnect</Button>
                </Row>
              ))
            )}
            {wallets.length > 0 ? (
              <Row
                label={<span className="flex items-start gap-2.5"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary"><Wallet size={16} /></span><span><span className="block">Add another wallet</span><span className="mt-0.5 block text-[12px] font-medium leading-4 text-muted-foreground">Base or Solana address with a custom color</span></span></span>}
              >
                <Button variant="secondary" size="small" onClick={() => setWalletModalOpen(true)}><LinkSimple /> Connect</Button>
              </Row>
            ) : null}
            <Row label={<span className="flex items-start gap-2.5"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary"><Briefcase size={16} /></span><span><span className="block">Bank</span><span className="mt-0.5 block text-[12px] font-medium leading-4 text-muted-foreground">Bank connections are planned for a future release.</span></span></span>}><Button variant="secondary" size="small" disabled>Coming soon</Button></Row>
          </Section>

          <Section label="Integrations">
            {duplicateEmails.length > 0 ? (
              <div className="-mx-1 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-500/10">
                <p className="m-0 text-[12px] font-medium leading-4 text-amber-900 dark:text-amber-100">
                  {duplicateEmails.length} duplicate {duplicateEmails.length === 1 ? "email was" : "emails were"} already imported and were not added again.
                </p>
                <Button variant="secondary" size="small" onClick={() => setDuplicatesOpen(true)}>Review duplicates</Button>
              </div>
            ) : null}
            {PROVIDER_ROWS.map((row) => {
              const status = providers[row.id]?.status ?? "disconnected";
              const connected = status === "connected";
              const busy = connectingProvider === row.id;
              const sync = syncState[row.id];
              const isEmail = EMAIL_PROVIDER_IDS.has(row.id);
              const description = !connected
                ? row.description
                : !isEmail
                  ? "Connected"
                  : sync?.busy
                    ? "Syncing inbox for statements, receipts, and bank alerts…"
                    : sync?.summary ?? "Connected — sync to import statements, receipts, and bank alerts";
              return (
                <Row
                  key={row.id}
                  label={<span className="flex items-start gap-2.5"><BrandLogo domain={row.domain} /><span><span className="block">{row.name}</span><span className="mt-0.5 block text-[12px] font-medium leading-4 text-muted-foreground">{description}</span></span></span>}
                >
                  {connected ? (
                    <div className="flex w-full flex-wrap justify-end gap-2">
                      {isEmail ? (
                        <Button variant="secondary" size="small" disabled={sync?.busy} onClick={() => void syncEmailProvider(row.id)}>
                          {sync?.busy ? "Syncing…" : <><CloudArrowDown /> Sync</>}
                        </Button>
                      ) : null}
                      <Button variant="secondary" size="small" onClick={() => void disconnectProvider(row.id)}><X /> Disconnect</Button>
                    </div>
                  ) : (
                    <Button variant="secondary" size="small" disabled={busy} onClick={() => void connectProvider(row.id)}>
                      {busy ? "Connecting…" : (<><LinkSimple /> Connect</>)}
                    </Button>
                  )}
                </Row>
              );
            })}
            <Row label={<span className="flex items-start gap-2.5"><BrandLogo domain="sheets.google.com" /><span><span className="block">Google Sheets</span><span className="mt-0.5 block text-[12px] font-medium leading-4 text-muted-foreground">Export transaction data to a spreadsheet.</span></span></span>}><Button variant="secondary" size="small"><LinkSimple /> Connect</Button></Row>
          </Section>

          <Section label="Notifications">
            <Toggle label="Filing deadline reminders" description="Reminder 30 days before configured filing deadlines." initial={false} />
            {FEATURES.budgeting ? <Toggle label="Budget alerts" description="Alert when a category is approaching its limit." /> : null}
            <Toggle label="Import completed" description="Get notified when a statement has finished processing." />
          </Section>

          <Section label="Preferences">
            <Row label="Theme"><SelectField id="theme" label="Theme" value={theme} onValueChange={(value) => setTheme(value ?? "system")} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} /></Row>
            <Row label="Accent color"><AccentColorPicker value={accentColor} onChange={handleAccentChange} /></Row>
            <Row label="Currency"><SelectField id="currency" label="Currency" value={currency} onValueChange={(value) => setCurrency(value ?? "ngn")} options={[{ value: "ngn", label: "NGN 🇳🇬" }, { value: "usd", label: "USD 🇺🇸" }, { value: "ghs", label: "GHS 🇬🇭" }, { value: "kes", label: "KES 🇰🇪" }, { value: "gbp", label: "GBP 🇬🇧" }]} /></Row>
            <Row label="Tax jurisdiction" description="Planning only. Dobby does not prepare or file returns."><SelectField id="jurisdiction" label="Tax jurisdiction" value={jurisdiction} options={[{ value: "nigeria", label: "Nigeria" }, { value: "united-kingdom", label: "United Kingdom" }, { value: "united-states", label: "United States" }]} onValueChange={(value) => { const next = value ?? "nigeria"; setJurisdiction(next); window.localStorage.setItem("dobby-tax-jurisdiction", next); }} /></Row>
          </Section>

          <Section label="Categories & rules">
            <Row label="Categorization" description="Keep categorization consistent across new imports."><Link href="/settings/categories-rules" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:text-accent-600">Manage categories and rules <ArrowRight size={14} /></Link></Row>
          </Section>

          <Section label="Data & subscription">
            <Row label="Export transactions" description="Download a CSV of your categorized transactions."><Button variant="secondary" size="small" onClick={() => toast.info("CSV export is ready to connect to the backend.")}><CloudArrowDown /> Export CSV</Button></Row>
            <Row label="Dobby plan" description="Plan management will be available here."><Button variant="secondary" size="small" disabled>Manage subscription</Button></Row>
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
      <WalletConnectModal
        open={walletModalOpen}
        onOpenChange={setWalletModalOpen}
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
