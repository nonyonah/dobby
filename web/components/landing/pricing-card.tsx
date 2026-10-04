"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckIcon } from "@/components/icons";

/**
 * Pricing card — one Pro plan sold on two cadences. The segmented picker
 * above the card is the only choice a visitor makes; payment method (card or
 * crypto) is settled later inside the checkout provider's own flow, so it is
 * deliberately not part of this UI.
 */

type Interval = "month" | "year";

const INTERVALS: { value: Interval; label: string }[] = [
  { value: "month", label: "Monthly" },
  { value: "year", label: "Annual" },
];

const PRICE: Record<Interval, { amount: string; cadence: string; note: string }> = {
  month: {
    amount: "$5",
    cadence: "per month",
    note: "Billed monthly. Cancel any time.",
  },
  year: {
    amount: "$50",
    cadence: "per year",
    note: "Billed yearly — $10 less than paying monthly, with a 7-day free trial.",
  },
};

/** Everything Dobby Pro unlocks, in the words the app itself uses. */
const PRO_FEATURES = [
  "Unlimited imports — statements, receipts and manual entries",
  "Email auto-fetch from Gmail or Outlook",
  "Wallet tracking with net worth across banks, cards and stablecoins",
  "Proactive AI flags that explain unusual activity",
  "Tax readiness — deduction flags and monthly reminders",
  "Categorisation and rules that learn from every approval",
];

export function PricingCard() {
  const [interval, setInterval] = useState<Interval>("month");
  const price = PRICE[interval];

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Segmented picker: equal-height segments so nothing shifts on change. */}
      <div
        role="tablist"
        aria-label="Billing period"
        className="inline-flex items-center gap-1 rounded-full border border-line bg-card p-1"
      >
        {INTERVALS.map((option) => {
          const selected = option.value === interval;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setInterval(option.value)}
              className={`inline-flex h-8 cursor-pointer items-center rounded-full px-4 text-[13px] font-medium outline-none transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 ${
                selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="flex w-full max-w-md flex-col gap-5 rounded-xl border border-line bg-card p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <p className="m-0 text-[14px] font-semibold text-foreground">Dobby Pro</p>
          <span className="inline-flex items-center rounded-full border border-line bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            7-day free trial
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="m-0 flex items-baseline gap-1.5">
            <span className="font-mono text-[40px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-foreground">
              {price.amount}
            </span>
            <span className="text-[13px] text-muted-foreground">{price.cadence}</span>
          </p>
          <p className="m-0 text-[12px] text-faint">{price.note}</p>
        </div>

        <div className="border-t border-line pt-5">
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {PRO_FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5 text-[13px] leading-snug text-foreground">
                <span aria-hidden="true" className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                  <CheckIcon />
                </span>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-2 border-t border-line pt-5">
          <Link
            href="/sign-up"
            className="inline-flex h-10 items-center justify-center rounded-[10px] bg-primary px-5 text-[13px] font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            Start free — 7-day trial
          </Link>
          <p className="m-0 text-center text-[12px] text-faint">No card required to start.</p>
        </div>
      </div>
    </div>
  );
}
