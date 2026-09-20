"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Briefcase, Check, CloudArrowDown, LinkSimple, Wallet, X } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ACCENT_COLORS, ACCENT_STORAGE_KEY, DEFAULT_ACCENT, applyAccentColor, type AccentColor } from "@/lib/theme";
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
      <Select className="w-fit" defaultValue={value} onValueChange={onValueChange}>
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
  const [walletConnected, setWalletConnected] = useState(true);
  const [accentColor, setAccentColor] = useState<AccentColor>(DEFAULT_ACCENT);
  const [saved, setSaved] = useState(false);

  const handleAccentChange = (next: AccentColor) => {
    setAccentColor(next);
    applyAccentColor(next);
    window.localStorage.setItem(ACCENT_STORAGE_KEY, next);
  };

  const saveChanges = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
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
            {saved ? <Check /> : null}
            {saved ? "Saved" : "Save changes"}
          </Button>
        </header>

        <div className="space-y-5">
          <Section label="Profile">
            <Row label="Full name" description="The name shown on your Dobby workspace."><TextField id="full-name" label="Full name" defaultValue="Ada Lovelace" /></Row>
            <Row label="Email address" description="Used for account messages and notifications."><TextField id="profile-email" label="Email address" defaultValue="ada@riftlabs.co" type="email" /></Row>
            <Row label="Country"><SelectField id="country" label="Country" value="nigeria" options={[{ value: "nigeria", label: "🇳🇬 Nigeria" }, { value: "ghana", label: "🇬🇭 Ghana" }, { value: "kenya", label: "🇰🇪 Kenya" }, { value: "other", label: "🌐 Other" }]} /></Row>
          </Section>

          <Section label="Connections">
            <Row label={<span className="flex items-start gap-2.5"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary"><Wallet size={16} /></span><span><span className="block">Wallet</span><span className="mt-0.5 block text-[12px] font-medium leading-4 text-muted-foreground">{walletConnected ? <span className="font-mono">0x71a4…c912 · $2,840.00 USDC</span> : "Not connected"}</span></span></span>}>
              {walletConnected ? <Button variant="secondary" size="small" onClick={() => setWalletConnected(false)}><X /> Disconnect</Button> : <Button variant="secondary" size="small" onClick={() => setWalletConnected(true)}><LinkSimple /> Connect</Button>}
            </Row>
            <Row label={<span className="flex items-start gap-2.5"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary"><Briefcase size={16} /></span><span><span className="block">Bank</span><span className="mt-0.5 block text-[12px] font-medium leading-4 text-muted-foreground">Bank connections are planned for a future release.</span></span></span>}><Button variant="secondary" size="small" disabled>Coming soon</Button></Row>
          </Section>

          <Section label="Integrations">
            <Row label={<span className="flex items-start gap-2.5"><BrandLogo domain="gmail.com" /><span><span className="block">Gmail</span><span className="mt-0.5 block text-[12px] font-medium leading-4 text-muted-foreground">Import and track transactions from email.</span></span></span>}><Button variant="secondary" size="small"><LinkSimple /> Connect</Button></Row>
            <Row label={<span className="flex items-start gap-2.5"><BrandLogo domain="outlook.com" /><span><span className="block">Outlook</span><span className="mt-0.5 block text-[12px] font-medium leading-4 text-muted-foreground">Import and track transactions from email.</span></span></span>}><Button variant="secondary" size="small"><LinkSimple /> Connect</Button></Row>
            <Row label={<span className="flex items-start gap-2.5"><BrandLogo domain="quickbooks.intuit.com" /><span><span className="block">QuickBooks</span><span className="mt-0.5 block text-[12px] font-medium leading-4 text-muted-foreground">Export transactions and reports to QuickBooks.</span></span></span>}><Button variant="secondary" size="small"><LinkSimple /> Connect</Button></Row>
            <Row label={<span className="flex items-start gap-2.5"><BrandLogo domain="xero.com" /><span><span className="block">Xero</span><span className="mt-0.5 block text-[12px] font-medium leading-4 text-muted-foreground">Export transactions and reports to Xero.</span></span></span>}><Button variant="secondary" size="small"><LinkSimple /> Connect</Button></Row>
            <Row label={<span className="flex items-start gap-2.5"><BrandLogo domain="sheets.google.com" /><span><span className="block">Google Sheets</span><span className="mt-0.5 block text-[12px] font-medium leading-4 text-muted-foreground">Export transaction data to a spreadsheet.</span></span></span>}><Button variant="secondary" size="small"><LinkSimple /> Connect</Button></Row>
          </Section>

          <Section label="Notifications">
            <Toggle label="Filing deadline reminders" description="Reminder 30 days before configured filing deadlines." initial={false} />
            <Toggle label="Budget alerts" description="Alert when a category is approaching its limit." />
            <Toggle label="Import completed" description="Get notified when a statement has finished processing." />
          </Section>

          <Section label="Preferences">
            <Row label="Theme"><SelectField id="theme" label="Theme" value="system" options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} /></Row>
            <Row label="Accent color"><AccentColorPicker value={accentColor} onChange={handleAccentChange} /></Row>
            <Row label="Currency"><SelectField id="currency" label="Currency" value="ngn" options={[{ value: "ngn", label: "NGN 🇳🇬" }, { value: "usd", label: "USD 🇺🇸" }, { value: "gbp", label: "GBP 🇬🇧" }]} /></Row>
            <Row label="Tax jurisdiction" description="Planning only. Dobby does not prepare or file returns."><SelectField id="jurisdiction" label="Tax jurisdiction" value="nigeria" options={[{ value: "nigeria", label: "Nigeria" }, { value: "united-kingdom", label: "United Kingdom" }, { value: "united-states", label: "United States" }]} onValueChange={(value) => { window.localStorage.setItem("dobby-tax-jurisdiction", value ?? "nigeria"); }} /></Row>
          </Section>

          <Section label="Categories & rules">
            <Row label="Categorization" description="Keep categorization consistent across new imports."><Link href="/settings/categories-rules" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:text-accent-600">Manage categories and rules <ArrowRight size={14} /></Link></Row>
          </Section>

          <Section label="Data & subscription">
            <Row label="Export transactions" description="Download a CSV of your categorized transactions."><Button variant="secondary" size="small" onClick={() => window.alert("CSV export is ready to connect to the backend.")}><CloudArrowDown /> Export CSV</Button></Row>
            <Row label="Dobby plan" description="Plan management will be available here."><Button variant="secondary" size="small" disabled>Manage subscription</Button></Row>
          </Section>
        </div>
      </div>
    </div>
  );
}
