"use client";

import { useState } from "react";
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
import { toast } from "./ui/toast";
import { CheckIcon } from "./icons";
import { EmojiPickerField } from "./ui/emoji-picker";
import { CATEGORIES, MONTH } from "@/lib/finance";
import type { BudgetDef } from "@/lib/budgets";
import { getAppCurrency } from "@/lib/format";

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
  categories?: Array<{ id: string; name: string; emoji: string }>;
}

type CreateStep = "suggestion" | "plan" | "manual";

const AI_CATEGORY_ID = "utilities";
const AI_BUDGET_AMOUNT = 300;
const AI_RECURRING_PAYMENT = 40;
const currency = { format: (value: number) => new Intl.NumberFormat(getAppCurrency() === "NGN" ? "en-NG" : "en-US", { style: "currency", currency: getAppCurrency(), maximumFractionDigits: 0 }).format(value) };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-[#55565c] dark:text-[#a2a3a8]">{label}</span>
      {children}
    </label>
  );
}

export function BudgetDialog({ open, onOpenChange, catId, initial, title, onSave, categories = [] }: BudgetDialogProps) {
  const isEditing = catId !== null;
  const options = categories.length > 0 ? categories : CATEGORIES;
  const [picked, setPicked] = useState(catId ?? options[0].id);
  const [budgetEmoji, setBudgetEmoji] = useState(options[0].emoji);
  const [step, setStep] = useState<CreateStep>("suggestion");
  const [type, setType] = useState<"fixed" | "percent">(initial.type);
  const [value, setValue] = useState(String(initial.value));
  const [includeRecurring, setIncludeRecurring] = useState(true);


  const save = (categoryId = picked, budgetType = type, budgetValue = value) => {
    const parsed = Number.parseFloat(budgetValue.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Enter an amount of $0 or more.");
      return;
    }
    onSave(categoryId, { type: budgetType, value: parsed, emoji: budgetEmoji });
    onOpenChange(false);
  };

  const useSuggestion = () => {
    setPicked(AI_CATEGORY_ID);
    setType("fixed");
    setValue(String(AI_BUDGET_AMOUNT));
    setStep("plan");
  };

  const openManual = () => {
    setStep("manual");
  };

  const cat = options.find((category) => category.id === picked);
  const availableCash = MONTH.income - MONTH.expenses;

  const editForm = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <p className="m-0 flex h-8 items-center gap-2 text-[13px] font-medium">
            <span aria-hidden="true">{cat?.emoji}</span> {cat?.name}
          </p>
        </Field>
        <Field label="Budget type">
          <Select value={type} onValueChange={(nextType) => setType((nextType as "fixed" | "percent") ?? "fixed")}>
            <SelectTrigger aria-label="Budget type" className="h-8 w-full bg-card text-[13px] text-foreground">
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
                onChange={(event) => setValue(event.target.value)}
                inputMode="decimal"
                aria-label={type === "fixed" ? "Amount in dollars" : "Percent of income"}
                className="mono h-8 bg-card pr-2 pl-7 text-[13px] text-foreground"
              />
            </div>
          </Field>
        </div>
      </div>
      <DialogFooter className="mt-4 sm:justify-between">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" type="submit">Save budget</Button>
      </DialogFooter>
    </form>
  );

  const manualForm = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <label htmlFor="budget-category" className="text-[12px] font-medium text-[#55565c] dark:text-[#a2a3a8]">Choose a category</label>
          <Select
            value={picked}
            onValueChange={(nextCategory) => {
              const next = options.find((category) => category.id === nextCategory);
              if (next) {
                setPicked(next.id);
                setBudgetEmoji(next.emoji);
              }
            }}
          >
            <SelectTrigger id="budget-category" aria-label="Choose a category" className="h-8 w-full bg-card text-[13px] text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((category) => <SelectItem key={category.id} value={category.id}>{category.emoji} {category.name}</SelectItem>)}
            </SelectContent>
          </Select>
        <div className="flex items-center gap-2 pt-1">
          <EmojiPickerField value={budgetEmoji} onChange={setBudgetEmoji} label="Choose a budget emoji" />
          <span className="text-[12px] font-medium text-muted-foreground">Customize the category emoji</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Budget type">
          <Select value={type} onValueChange={(nextType) => setType((nextType as "fixed" | "percent") ?? "fixed")}>
            <SelectTrigger aria-label="Budget type" className="h-8 w-full bg-card text-[13px] text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">Fixed amount</SelectItem>
              <SelectItem value="percent">% of income</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={type === "fixed" ? "Monthly amount" : "Percent of income"}>
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[13px] text-[#8a8b91] dark:text-[#a2a3a8]">
              {type === "fixed" ? "$" : "%"}
            </span>
            <Input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              inputMode="decimal"
              className="mono h-8 bg-card pr-2 pl-7 text-[13px] text-foreground"
            />
          </div>
        </Field>
      </div>
      <DialogFooter className="sm:justify-between">
        <Button variant="ghost" onClick={() => setStep("suggestion")}>Back</Button>
        <Button variant="primary" type="submit">Create budget</Button>
      </DialogFooter>
    </form>
  );

  const creationContent = step === "suggestion" ? (
    <>
      <DialogHeader>
        <DialogTitle>Start with a smart budget</DialogTitle>
        <DialogDescription>
          We reviewed this month’s mock cash flow to find a useful place to start.
        </DialogDescription>
      </DialogHeader>
      <div className="rounded-lg border border-border bg-secondary/40 p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-muted-foreground">Monthly income</span>
          <span className="mono text-[13px] font-medium tabular-nums">{currency.format(MONTH.income)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="text-[12px] text-muted-foreground">Current spending</span>
          <span className="mono text-[13px] font-medium tabular-nums">{currency.format(MONTH.expenses)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-2">
          <span className="text-[12px] font-medium">Available to plan</span>
          <span className="mono text-[13px] font-semibold tabular-nums">{currency.format(availableCash)}</span>
        </div>
      </div>
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
        <p className="m-0 text-[13px] font-medium">💡 Budget for Utilities</p>
        <p className="mt-1 mb-0 text-[12px] leading-relaxed text-muted-foreground">
          Your cash flow includes an electricity payment and no current Utilities budget. We recommend setting aside {currency.format(AI_BUDGET_AMOUNT)} per month.
        </p>
      </div>
      <DialogFooter className="sm:justify-between">
        <Button variant="ghost" onClick={openManual}>Create manually</Button>
        <Button variant="primary" onClick={useSuggestion}>Review suggestion</Button>
      </DialogFooter>
    </>
  ) : step === "plan" ? (
    <>
      <DialogHeader>
        <DialogTitle>Review your Utilities budget</DialogTitle>
        <DialogDescription>Confirm the suggested amount and how to treat recurring payments.</DialogDescription>
      </DialogHeader>
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[13px] font-medium"><span aria-hidden="true">💡</span> Utilities</span>
          <span className="mono text-[13px] font-semibold tabular-nums">{currency.format(AI_BUDGET_AMOUNT)} / month</span>
        </div>
        <p className="mt-2 mb-0 text-[12px] text-muted-foreground">Suggested from your current cash flow and recent activity.</p>
      </div>
      <fieldset>
        <legend className="mb-2 text-[12px] font-medium text-[#55565c] dark:text-[#a2a3a8]">Recurring payment handling</legend>
        <button
          type="button"
          onClick={() => setIncludeRecurring((current) => !current)}
          aria-pressed={includeRecurring}
          className={`flex w-full cursor-pointer items-start gap-3 rounded-lg border p-3 text-left outline-none transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 ${
            includeRecurring ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"
          }`}
        >
          <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border ${includeRecurring ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground"}`} aria-hidden="true">
            {includeRecurring ? <CheckIcon /> : null}
          </span>
          <span>
            <span className="block text-[13px] font-medium">Count Electricity Bill toward this budget</span>
            <span className="mt-0.5 block text-[12px] text-muted-foreground">Include the recurring {currency.format(AI_RECURRING_PAYMENT)} email payment in Utilities spending.</span>
          </span>
        </button>
      </fieldset>
      <DialogFooter className="sm:justify-between">
        <Button variant="ghost" onClick={openManual}>Adjust manually</Button>
        <Button variant="primary" onClick={() => save(AI_CATEGORY_ID, "fixed", String(AI_BUDGET_AMOUNT))}>Create Utilities budget</Button>
      </DialogFooter>
    </>
  ) : (
    <>
      <DialogHeader>
        <DialogTitle>Create a budget manually</DialogTitle>
        <DialogDescription>Choose a category, its emoji, and a monthly target.</DialogDescription>
      </DialogHeader>
      {manualForm}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {isEditing ? (
          <>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>
                Set a fixed amount or a share of monthly income. Spending from cards, wallets, Composio and manual entries rolls into one total.
              </DialogDescription>
            </DialogHeader>
            {editForm}
          </>
        ) : creationContent}
      </DialogContent>
    </Dialog>
  );
}
