"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { NativeSelect } from "./ui/native-select";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { TX_CATEGORIES, type TxFull } from "@/lib/transactions";
import type { TxSource } from "@/lib/finance";
import { useAppCurrency } from "@/hooks/use-app-currency";

export interface DialogCategoryOption {
  id: string;
  name: string;
  emoji: string;
}

interface TxEditDialogProps {
  tx: TxFull | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (tx: TxFull, opts?: { rememberRule: boolean }) => void;
  categories?: DialogCategoryOption[];
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/**
 * Rift Labs Dialog: one-sentence consequence, Cancel left,
 * the named commit action right.
 */
export function TxEditDialog({ tx, open, onOpenChange, onSave, categories = [] }: TxEditDialogProps) {
  // Above the `if (!tx)` bail-out: the amount field is priced in the display
  // currency, so it has to follow a preference change while the dialog is open.
  const appCurrency = useAppCurrency();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  // Seeded as null and resolved from the loaded options on open, so the trigger
  // never shows the literal "other" before the effect has run.
  const [category, setCategory] = useState("");
  const [taxable, setTaxable] = useState("non-taxable");
  const [source, setSource] = useState<TxSource>("manual");
  const [note, setNote] = useState("");
  const [rememberRule, setRememberRule] = useState(false);
  const options =
    categories.length > 0
      ? categories
      : TX_CATEGORIES.map((c) => ({ id: c.id, name: c.label, emoji: c.emoji }));

  useEffect(() => {
    if (tx && open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- form reset on open
      setName(tx.name);
      setAmount(String(Math.abs(tx.amount)));
      setDate(tx.date);
      const liveIds = new Set(options.map((o) => o.id));
      const preferred = tx.categoryId && liveIds.has(tx.categoryId) ? tx.categoryId : options.find((option) => option.id === tx.category)?.id;
      setCategory(preferred ?? options[0]?.id ?? "");
      setTaxable(tx.taxable ? "taxable" : "non-taxable");
      setSource(tx.source);
      setNote(tx.note);
      // Uncategorized rows offer to remember the fix; categorized rows don't.
      setRememberRule(!tx.categoryId || tx.categoryName === "Uncategorized");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx, open]);

  if (!tx) return null;

  const amountCurrency = appCurrency;
  const amountSymbol = (() => {
    try {
      const parts = new Intl.NumberFormat("en-US", { style: "currency", currency: amountCurrency }).formatToParts(0);
      return parts.find((part) => part.type === "currency")?.value ?? amountCurrency;
    } catch {
      return amountCurrency;
    }
  })();

  const commit = () => {
    const parsed = Number.parseFloat(amount.replace(/[^0-9.]/g, ""));
    const amountChanged = Number.isFinite(parsed) && Math.abs(parsed - Math.abs(tx.amount)) > 0.000001;
    const liveIds = new Set(options.map((o) => o.id));
    const option = options.find((o) => o.id === category);
    onSave({
      ...tx,
      name: name.trim() || tx.name,
      amount: (tx.amount < 0 ? -1 : 1) * (Number.isFinite(parsed) ? parsed : Math.abs(tx.amount)),
      sourceAmount: amountChanged ? Math.abs(parsed) : tx.sourceAmount,
      currency: amountChanged ? appCurrency : tx.currency,
      date: date || tx.date,
      category,
      categoryId: liveIds.has(category) ? category : tx.categoryId,
      categoryName: option?.name ?? tx.categoryName,
      taxable: taxable === "taxable",
      source,
      note: note.trim(),
    }, { rememberRule });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit transaction</DialogTitle>
          <DialogDescription>
            Corrections apply immediately and update totals everywhere.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Merchant">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 bg-card text-[13px]" />
          </Field>
          <Field label="Amount">
            <div className="relative">
              <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[13px] text-muted-foreground">
                {amountSymbol}
              </span>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                aria-label={`Amount in ${amountCurrency}`}
                className="mono h-8 bg-card pr-3 pl-10 text-[13px]"
              />
            </div>
          </Field>
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 bg-card text-[13px]" />
          </Field>
          <Field label="Category">
            <NativeSelect
              aria-label="Category"
              value={category}
              onValueChange={setCategory}
              options={options.map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` }))}
            />
          </Field>
          <Field label="Tax status">
            <NativeSelect
              aria-label="Tax status"
              value={taxable}
              onValueChange={(v) => setTaxable(v === "taxable" ? "taxable" : "non-taxable")}
              options={[
                { value: "taxable", label: "Taxable" },
                { value: "non-taxable", label: "Non-taxable" },
              ]}
            />
          </Field>
          <Field label="Source">
            <NativeSelect
              aria-label="Source"
              value={source}
              onValueChange={(v) => setSource(v as TxSource)}
              options={[
                { value: "manual", label: "Manual entry" },
                { value: "email", label: "Email receipt" },
                { value: "card", label: "Card sync" },
                { value: "wallet", label: "Wallet sync" },
              ]}
            />
          </Field>
          <div className="col-span-2">
            <Field label="Note">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Add context for your books…"
                className="bg-card text-[13px]"
              />
            </Field>
          </div>
          <div className="col-span-2 flex items-center justify-between gap-3 rounded-lg bg-secondary px-3 py-2">
            <span className="text-[12px] font-medium text-foreground">Remember for similar transactions</span>
            <Switch id="remember-rule" checked={rememberRule} onCheckedChange={setRememberRule} aria-label="Remember for similar transactions" />
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={commit}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
