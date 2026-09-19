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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Button } from "./ui/button";
import { CATEGORIES } from "@/lib/finance";
import type { BudgetDef } from "@/lib/budgets";

export interface BudgetForm {
  catId: string;
  type: "fixed" | "percent";
  value: string;
}

interface BudgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fixed category when editing; selectable when creating. */
  catId: string | null;
  initial: BudgetDef;
  title: string;
  onSave: (catId: string, def: BudgetDef) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-[#55565c] dark:text-[#a2a3a8]">{label}</span>
      {children}
    </label>
  );
}

export function BudgetDialog({ open, onOpenChange, catId, initial, title, onSave }: BudgetDialogProps) {
  const [picked, setPicked] = useState(catId ?? CATEGORIES[0].id);
  const [type, setType] = useState<"fixed" | "percent">(initial.type);
  const [value, setValue] = useState(String(initial.value));

  useEffect(() => {
    if (open) {
      setPicked(catId ?? CATEGORIES[0].id);
      setType(initial.type);
      setValue(String(initial.value));
    }
  }, [open, catId, initial.type, initial.value]);

  const commit = () => {
    const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(parsed) || parsed < 0) return;
    onSave(picked, { type, value: parsed });
    onOpenChange(false);
  };

  const cat = CATEGORIES.find((c) => c.id === picked);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Set a fixed amount or a share of monthly income. Spending from cards,
            wallets, Composio and manual entries rolls into one total.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            {catId ? (
              <p className="m-0 flex h-8 items-center gap-2 text-[13px] font-medium">
                <span aria-hidden="true">{cat?.emoji}</span> {cat?.name}
              </p>
            ) : (
              <Select value={picked} onValueChange={(v) => setPicked(v ?? CATEGORIES[0].id)}>
                <SelectTrigger aria-label="Category" className="h-8 w-full bg-white dark:bg-[#232327] text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.emoji} {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Budget type">
            <Select value={type} onValueChange={(v) => setType((v as "fixed" | "percent") ?? "fixed")}>
              <SelectTrigger aria-label="Budget type" className="h-8 w-full bg-white dark:bg-[#232327] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fixed amount</SelectItem>
                <SelectItem value="percent">% of income</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="col-span-2">
            <Field label={type === "fixed" ? "Monthly amount" : "Percent of income"}>
              <div className="relative">
                <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[13px] text-[#8a8b91] dark:text-[#a2a3a8]">
                  {type === "fixed" ? "$" : "%"}
                </span>
                <Input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  inputMode="decimal"
                  aria-label={type === "fixed" ? "Amount in dollars" : "Percent of income"}
                  className="mono h-8 bg-white dark:bg-[#232327] pr-2 pl-7 text-[13px]"
                />
              </div>
            </Field>
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={commit}>
            Save budget
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
