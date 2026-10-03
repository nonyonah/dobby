"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertIcon, SettingsIcon } from "@hugeicons/core-free-icons";
import { Alert, AlertContent, AlertDescription, AlertIndicator } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toast";
import { useApi } from "@/hooks/use-api";
import { TAX_JURISDICTIONS } from "@/lib/countries";
import { formatCurrency } from "@/lib/format";

type DeductionSpec = {
  key: string;
  label: string;
  hint?: string;
  cap?: { amount: number; note: string };
  requiresEvidence?: boolean;
};

type InputSpec = {
  key: string;
  label: string;
  hint?: string;
  kind: "select" | "number" | "count";
  options?: Array<{ value: string; label: string }>;
  defaultValue?: string;
};

type TaxRules = {
  country: string;
  currency: string;
  taxYear: number;
  taxYearLabel: string;
  inputs: InputSpec[];
  deductions: DeductionSpec[];
  credits: Array<{ key: string; label: string; hint?: string }>;
  answers: Record<string, string>;
  deductionsCaptured: Record<string, unknown>;
};

const INCOME_SOURCES = [
  { value: "EMPLOYMENT", label: "Employment — salary or wages" },
  { value: "SELF_EMPLOYMENT", label: "Self-employment — freelance, contract, business" },
  { value: "INVESTMENT", label: "Investment — interest, dividends, capital gains" },
  { value: "RENTAL", label: "Rental income" },
  { value: "OTHER", label: "Other" },
];

const numberControl =
  "h-8 w-full rounded-md border border-line bg-card px-3 text-[13px] text-foreground shadow-[0_0_0_0.5px_rgb(0_0_0/0.09)] outline-none transition-shadow duration-150 ease-out focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The deductions form did not exist at all, which made every statutory relief in
 * every jurisdiction unreachable — the modules computed reliefs nothing could
 * supply. This renders straight from the descriptors the calculating module
 * publishes via `GET /v1/tax/rules`, so a field can never appear without a rule
 * that reads it, and a new country needs no changes here at all.
 */
export function TaxSettingsForm({ onSaved }: { onSaved?: () => void }) {
  const api = useApi();
  const [rules, setRules] = React.useState<TaxRules | null>(null);
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [deductions, setDeductions] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void api
      .get<{ data: TaxRules }>("/v1/tax/rules")
      .then((response) => {
        if (cancelled) return;
        setRules(response.data);
        setAnswers(response.data.answers ?? {});
        const captured: Record<string, string> = {};
        for (const spec of response.data.deductions) {
          const value = response.data.deductionsCaptured?.[spec.key];
          captured[spec.key] = typeof value === "number" || typeof value === "string" ? String(value) : "";
        }
        setDeductions(captured);
      })
      .catch(() => {
        if (!cancelled) setRules(null);
      });
    return () => { cancelled = true; };
  }, [api]);

  const save = async () => {
    if (!rules) return;
    setSaving(true);
    // Only the keys this jurisdiction actually declares are sent, so switching
    // jurisdiction cannot carry a previous country's inputs over as garbage.
    const payload: Record<string, unknown> = {
      deductions: Object.fromEntries(
        rules.deductions
          .map((spec) => [spec.key, Number(deductions[spec.key]) || 0])
          .filter(([, value]) => (value as number) > 0),
      ),
    };
    for (const spec of rules.inputs) {
      if (answers[spec.key] !== undefined) payload[spec.key] = answers[spec.key];
    }
    try {
      await api.patch("/v1/tax/profile", payload);
      toast.success("Tax settings saved");
      onSaved?.();
    } catch {
      toast.error("Could not save your tax settings. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const classifyAll = async (incomeSource: string) => {
    try {
      const response = await api.patch<{ data: { updated: number } }>("/v1/tax/income-source", { incomeSource });
      toast.success(`Labelled ${response.data.updated} income ${response.data.updated === 1 ? "record" : "records"}`);
      onSaved?.();
    } catch {
      toast.error("Could not label your income. Try again.");
    }
  };

  if (!rules) {
    return <p className="m-0 text-[13px] text-muted-foreground">Loading your tax settings…</p>;
  }

  const jurisdiction = TAX_JURISDICTIONS.find(
    (entry) => entry.currency === rules.currency && entry.name.toLowerCase().includes(String(rules.country).toLowerCase().slice(0, 4)),
  );
  const money = (value: number) => formatCurrency(value, rules.currency);
  const hasEvidenceRequirements = rules.deductions.some((spec) => spec.requiresEvidence);

  return (
    <div aria-label="Tax settings">
      <div className="mb-3">
        <p className="m-0 text-[12px] text-muted-foreground">
          {jurisdiction?.label ?? rules.country} · {rules.taxYearLabel} · estimated in {rules.currency}
        </p>
        {jurisdiction?.scope ? (
          <Alert status="warning" className="mt-2">
            <AlertIndicator>
              <HugeiconsIcon icon={AlertIcon} strokeWidth={2}  />
            </AlertIndicator>
            <AlertContent>
              <AlertDescription>{jurisdiction.scope}</AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}
      </div>

      {rules.inputs.length > 0 ? (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rules.inputs.map((spec) => (
            <div key={spec.key}>
              <label htmlFor={`tax-input-${spec.key}`} className="mb-1 block text-[12px] font-medium">
                {spec.label}
              </label>
              {spec.kind === "select" ? (
                <NativeSelect
                  id={`tax-input-${spec.key}`}
                  value={answers[spec.key] ?? spec.defaultValue ?? ""}
                  onValueChange={(value) => setAnswers((current) => ({ ...current, [spec.key]: value }))}
                  options={spec.options ?? []}
                />
              ) : (
                <input
                  id={`tax-input-${spec.key}`}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className={numberControl}
                  value={answers[spec.key] ?? spec.defaultValue ?? ""}
                  onChange={(event) => setAnswers((current) => ({ ...current, [spec.key]: event.target.value }))}
                />
              )}
              {spec.hint ? <p className="m-0 mt-1 text-[12px] leading-relaxed text-muted-foreground">{spec.hint}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {rules.deductions.length > 0 ? (
        <div className="mb-4">
          <p className="m-0 mb-2 text-[13px] font-semibold">Deductions</p>
          {hasEvidenceRequirements ? (
            <Alert status="warning" className="mb-2">
              <AlertIndicator>
                <HugeiconsIcon icon={AlertIcon} strokeWidth={2}  />
              </AlertIndicator>
              <AlertContent>
                <AlertDescription>
                  A deduction that is not claimed in writing with supporting documents is not allowed, no matter what you enter here.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {rules.deductions.map((spec) => (
              <div key={spec.key}>
                <label htmlFor={`tax-deduction-${spec.key}`} className="mb-1 block text-[12px] font-medium">
                  {spec.label}
                  <span className="ml-1 font-normal text-muted-foreground">({rules.currency})</span>
                </label>
                <input
                  id={`tax-deduction-${spec.key}`}
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  className={numberControl}
                  placeholder="0"
                  value={deductions[spec.key] ?? ""}
                  onChange={(event) => setDeductions((current) => ({ ...current, [spec.key]: event.target.value }))}
                />
                {spec.hint ? <p className="m-0 mt-1 text-[12px] leading-relaxed text-muted-foreground">{spec.hint}</p> : null}
                {spec.cap ? (
                  <p className="m-0 mt-1 text-[12px] leading-relaxed text-muted-foreground">
                    Capped at {money(spec.cap.amount)}. {spec.cap.note}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mb-4">
        <p className="m-0 mb-1 text-[13px] font-semibold">Label your income</p>
        <p className="m-0 mb-2 text-[12px] leading-relaxed text-muted-foreground">
          Which tax applies depends on where the income came from, not just how much. Labelling your unlabelled income as one
          type is a fast way to make the estimate much closer to the truth.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {INCOME_SOURCES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => void classifyAll(option.value)}
              className="h-8 cursor-pointer rounded-md border border-line bg-card px-3 text-[12px] font-medium transition-colors hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="h-9 w-full cursor-pointer rounded-md bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {saving ? "Saving…" : "Save tax settings"}
      </button>
    </div>
  );
}

/**
 * Tax settings live behind a dialog rather than inline on the Insights page.
 *
 * The form is a working surface — jurisdiction switches, a dozen deduction
 * fields, income labelling — and inline it buried the actual estimate below a
 * wall of controls. Behind a button the estimate is the first thing you read,
 * and the settings are there when you want them.
 *
 * The trigger is `outline`, the lowest-emphasis button variant this app has: a
 * settings affordance should not compete with the numbers it configures.
 */
export function TaxSettingsDialog({ onSaved }: { onSaved?: () => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label="Tax settings" title="Tax settings">
          <HugeiconsIcon icon={SettingsIcon} strokeWidth={2}  />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tax settings</DialogTitle>
          <DialogDescription>
            Deduction amounts, jurisdiction details and income labelling. Estimates only — Dobby does not file
            anything.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          <TaxSettingsForm
            onSaved={() => {
              onSaved?.();
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
