"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, CloudArrowDown, LinkSimple, X } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const controlClass = "h-8 w-full rounded-md text-[13px]";
const rowClass = "flex flex-col gap-2 px-4 py-3 sm:grid sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center sm:gap-6";

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${label.toLowerCase().replaceAll(" ", "-")}-heading`}>
      <h2 id={`${label.toLowerCase().replaceAll(" ", "-")}-heading`} className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </h2>
      <Card className="rounded-xl border border-line bg-card shadow-none">
        <CardContent className="p-0 [&>*+*]:mx-4 [&>*+*]:border-t [&>*+*]:border-soft-line">{children}</CardContent>
      </Card>
    </section>
  );
}

function Row({ label, description, children, align = "center" }: { label: string; description?: React.ReactNode; children: React.ReactNode; align?: "center" | "start" }) {
  return (
    <div className={`${rowClass} ${align === "start" ? "sm:items-start" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground">{label}</p>
        {description ? <p className="mt-0.5 max-w-[440px] text-[12px] leading-4 text-muted-foreground">{description}</p> : null}
      </div>
      <div className="w-full sm:w-[220px]">{children}</div>
    </div>
  );
}

function TextField({ id, label, defaultValue, type = "text" }: { id: string; label: string; defaultValue: string; type?: string }) {
  return <Input id={id} aria-label={label} type={type} defaultValue={defaultValue} className={controlClass} />;
}

function Toggle({ label, description, initial = true }: { label: string; description: string; initial?: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const id = `setting-${label.toLowerCase().replaceAll(" ", "-")}`;
  return <div className={rowClass}>
    <label htmlFor={id} className="min-w-0 cursor-pointer"><span className="block text-[13px] font-medium text-foreground">{label}</span><span className="mt-0.5 block text-[12px] leading-4 text-muted-foreground">{description}</span></label>
    <Switch id={id} checked={enabled} onCheckedChange={setEnabled} aria-label={`${label}: ${enabled ? "on" : "off"}`} />
  </div>;
}

function SelectField({ id, label, value, options, onValueChange }: { id: string; label: string; value: string; options: Array<{ value: string; label: string }>; onValueChange?: (value: string | null) => void }) {
  return (
    <Select defaultValue={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} aria-label={label} className={controlClass}><SelectValue /></SelectTrigger>
      <SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export function SettingsPage() {
  const [emailConnected, setEmailConnected] = useState(true);
  const [walletConnected, setWalletConnected] = useState(true);
  const [saved, setSaved] = useState(false);

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
            <Row label="Timezone"><TextField id="timezone" label="Timezone" defaultValue="Africa/Lagos (WAT)" /></Row>
            <Row label="Business type" description="Used to tailor categories and tax planning defaults."><SelectField id="business-type" label="Business type" value="freelancer" options={[{ value: "freelancer", label: "Freelancer" }, { value: "small-business", label: "Small business" }, { value: "other", label: "Other" }]} /></Row>
            <Row label="Country"><SelectField id="country" label="Country" value="nigeria" options={[{ value: "nigeria", label: "Nigeria" }, { value: "ghana", label: "Ghana" }, { value: "kenya", label: "Kenya" }, { value: "other", label: "Other" }]} /></Row>
          </Section>

          <Section label="Connections">
            <Row label="Email" description={emailConnected ? "Connected · ada@riftlabs.co" : "Not connected"}>
              {emailConnected ? <Button variant="secondary" size="small" onClick={() => setEmailConnected(false)}><X /> Disconnect</Button> : <Button variant="secondary" size="small" onClick={() => setEmailConnected(true)}><LinkSimple /> Connect Email</Button>}
            </Row>
            <Row label="Email access scope" description="Read-only access for receipts and statements. Dobby never sends email." align="start"><span className="inline-flex items-center gap-1.5 text-[12px] text-success"><Check size={14} /> Limited read-only scope</span></Row>
            <Row label="Wallet" description={walletConnected ? <span className="font-mono">0x71a4…c912 · $2,840.00 USDC</span> : "Not connected"}>
              {walletConnected ? <Button variant="secondary" size="small" onClick={() => setWalletConnected(false)}><X /> Disconnect</Button> : <Button variant="secondary" size="small" onClick={() => setWalletConnected(true)}><LinkSimple /> Connect Wallet</Button>}
            </Row>
            <Row label="Bank" description="Bank connections are planned for a future release."><Button variant="secondary" size="small" disabled>Coming soon</Button></Row>
            <Row label="Card" description="Card connections are planned for a future release."><Button variant="secondary" size="small" disabled>Coming soon</Button></Row>
          </Section>

          <Section label="Notifications">
            <Toggle label="Filing deadline reminders" description="Reminder 30 days before configured filing deadlines." initial={false} />
            <Toggle label="Budget alerts" description="Alert when a category is approaching its limit." />
            <Toggle label="Import completed" description="Get notified when a statement has finished processing." />
          </Section>

          <Section label="Preferences">
            <Row label="Theme"><SelectField id="theme" label="Theme" value="system" options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} /></Row>
            <Row label="Accent color"><SelectField id="accent" label="Accent color" value="indigo" options={[{ value: "indigo", label: "Indigo" }, { value: "graphite", label: "Graphite" }, { value: "green", label: "Green" }]} /></Row>
            <Row label="Currency"><SelectField id="currency" label="Currency" value="ngn" options={[{ value: "ngn", label: "NGN · Nigerian naira" }, { value: "usd", label: "USD · US dollar" }, { value: "gbp", label: "GBP · Pound sterling" }]} /></Row>
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
