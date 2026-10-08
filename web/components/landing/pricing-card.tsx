"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckIcon } from "@/components/icons";
import { Switch } from "@/components/ui/switch";

/**
 * Pricing card — one Pro plan sold on two cadences. The segmented picker
 * above the card is the only choice a visitor makes; payment method (card or
 * crypto) is settled later inside the checkout provider's own flow, so it is
 * deliberately not part of this UI.
 */

type Interval = "month" | "year";

/** Mirrors api/src/lib/bachs.ts BACHS_USD_PRICES ($4/mo, $36/yr = 25% off). */
const PRICE: Record<Interval, { amount: string; cadence: string; note: string }> = {
  month: {
    amount: "$4",
    cadence: "per month",
    note: "Billed monthly. Cancel any time.",
  },
  year: {
    amount: "$36",
    cadence: "per year",
    note: "Billed yearly — 25% off monthly, with a 7-day free trial.",
  },
};

/** Everything Dobby Pro unlocks, in the words the app itself uses. */
const PRO_FEATURES = [
  "Everything in Free",
  "Email auto-fetch from Gmail or Outlook",
  "Stablecoin wallet connections",
  "Proactive AI flags that explain unusual activity",
  "Tax advisory — estimates, deduction flags and reminders",
];

const FREE_FEATURES = [
  "Statement and receipt imports",
  "Automatic categorization for every transaction",
  "Review queue and rules that learn from approvals",
  "Net worth across wallets and accounts",
  "Your ledger and history, kept forever",
];

export function PricingCard() {
  const [interval, setInterval] = useState<Interval>("month");
  const price = PRICE[interval];

  return (
    <div className="flex w-full flex-col items-start gap-6">
      {/* Cadence toggle: labels flank the switch, annual discount reads as a chip. */}
      <div className="flex items-center gap-3">
        <span className={`text-[13px] font-medium ${interval === "month" ? "text-foreground" : "text-muted-foreground"}`}>
          Monthly
        </span>
        <Switch
          checked={interval === "year"}
          onCheckedChange={(checked) => setInterval(checked ? "year" : "month")}
          aria-label="Toggle annual billing"
        />
        <span className={`text-[13px] font-medium ${interval === "year" ? "text-foreground" : "text-muted-foreground"}`}>
          Annual
        </span>
        <span className="inline-flex items-center rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-medium text-success">
          25% off
        </span>
      </div>

      <div className="flex w-full flex-col gap-6 sm:flex-row">
      <div className="flex w-full flex-col gap-5 rounded-[2px] bg-[#131517] p-6 sm:w-1/2 sm:p-7">
        {/* Free card, rendered above: */}
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <p className="m-0 text-[14px] font-semibold text-foreground">Dobby Free</p>
            <span className="inline-flex items-center rounded-full border border-line bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              Forever
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="m-0 flex items-baseline gap-1.5">
              <span className="font-mono text-[40px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-foreground">$0</span>
              <span className="text-[13px] text-muted-foreground">per month</span>
            </p>
            <p className="m-0 text-[12px] text-faint">No card required.</p>
          </div>
          <div className="border-t border-line pt-5">
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {FREE_FEATURES.map((feature) => (
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
              className="inline-flex h-10 items-center justify-center rounded-[50px] bg-card px-5 text-[13px] font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            >
              Start with Free
            </Link>
          </div>
        </div>
      </div>

      <div className="flex w-full flex-col gap-5 rounded-[2px] bg-[#131517] p-6 sm:w-1/2 sm:p-7">
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
            className="inline-flex h-10 items-center justify-center rounded-[50px] bg-primary px-5 text-[13px] font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            Start Pro — 7-day trial
          </Link>
          <p className="m-0 text-center text-[12px] text-faint">No card required to start.</p>
        </div>
      </div>
      </div>
    </div>
  );
}
