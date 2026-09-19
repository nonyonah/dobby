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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Button } from "./ui/button";
import { TX_CATEGORIES, type TxFull } from "@/lib/transactions";
import type { TxSource } from "@/lib/finance";

interface TxEditDialogProps {
  tx: TxFull | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (tx: TxFull) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-[#55565c] dark:text-[#a2a3a8]">{label}</span>
      {children}
    </label>
  );
}

/**
 * Rift Labs Dialog: one-sentence consequence, Cancel left,
 * the named commit action right.
 */
export function TxEditDialog({ tx, open, onOpenChange, onSave }: TxEditDialogProps) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [category, setCategory] = useState("other");
  const [taxable, setTaxable] = useState("non-taxable");
  const [source, setSource] = useState<TxSource>("manual");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (tx && open) {
      setName(tx.name);
      setAmount(String(Math.abs(tx.amount)));
      setDate(tx.date);
      setCategory(tx.category);
      setTaxable(tx.taxable ? "taxable" : "non-taxable");
      setSource(tx.source);
      setNote(tx.note);
    }
  }, [tx, open]);

  if (!tx) return null;

  const commit = () => {
    const parsed = Number.parseFloat(amount.replace(/[^0-9.]/g, ""));
    onSave({
      ...tx,
      name: name.trim() || tx.name,
      amount: (tx.amount < 0 ? -1 : 1) * (Number.isFinite(parsed) ? parsed : Math.abs(tx.amount)),
      date: date || tx.date,
      category,
      taxable: taxable === "taxable",
      source,
      note: note.trim(),
    });
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
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 bg-white dark:bg-[#232327] text-[13px]" />
          </Field>
          <Field label="Amount">
            <div className="relative">
              <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[13px] text-[#8a8b91] dark:text-[#a2a3a8]">
                $
              </span>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                aria-label="Amount in dollars"
                className="mono h-8 bg-white dark:bg-[#232327] pr-2 pl-7 text-[13px]"
              />
            </div>
          </Field>
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 bg-white dark:bg-[#232327] text-[13px]" />
          </Field>
          <Field label="Category">
            <Select value={category} onValueChange={(v) => setCategory(v ?? "other")}>
              <SelectTrigger aria-label="Category" className="h-8 w-full bg-white dark:bg-[#232327] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TX_CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tax status">
            <Select value={taxable} onValueChange={(v) => setTaxable(v ?? "non-taxable")}>
              <SelectTrigger aria-label="Tax status" className="h-8 w-full bg-white dark:bg-[#232327] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="taxable">Taxable</SelectItem>
                <SelectItem value="non-taxable">Non-taxable</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Source">
            <Select value={source} onValueChange={(v) => setSource(v as TxSource)}>
              <SelectTrigger aria-label="Source" className="h-8 w-full bg-white dark:bg-[#232327] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual entry</SelectItem>
                <SelectItem value="email">Email receipt</SelectItem>
                <SelectItem value="card">Card sync</SelectItem>
                <SelectItem value="wallet">Wallet sync</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="col-span-2">
            <Field label="Note">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Add context for your books…"
                className="bg-white dark:bg-[#232327] text-[13px]"
              />
            </Field>
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
