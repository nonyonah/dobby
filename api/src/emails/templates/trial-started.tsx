import * as React from "react";
import { Cta, Detail, Figure, Footnote, Lead, Layout } from "../components.js";
import { appUrl } from "../links.js";

/**
 * Trial started.
 *
 * This is the first email a new subscriber should receive, so it confirms the
 * one thing that is easy to get wrong and expensive to guess at: the trial is
 * attached to the card they just used, not to the day they created an account.
 * Someone who signed up weeks ago and only now checked out should read this and
 * understand why their seven days start now rather than feeling short-changed.
 *
 * `endsOn` is computed by the caller from the persisted clock rather than
 * assumed here, so the date in the email is the same date the product bills
 * against.
 */
export function TrialStartedEmail({
  firstName,
  days,
  endsOn,
  alreadySubscribed = false,
}: {
  firstName?: string | null;
  days: number;
  /** Human-readable end date, already formatted for the reader. */
  endsOn?: string | null;
  /** True when the checkout produced a paid subscription rather than a trial. */
  alreadySubscribed?: boolean;
}) {
  const preview = alreadySubscribed
    ? "Thanks for subscribing — Dobby Pro is active."
    : `Your ${days}-day Dobby Pro trial has started.`;

  return (
    <Layout preview={preview}>
      <Figure tone="accent" caption={alreadySubscribed ? "Pro is active" : "Your free trial"}>
        {alreadySubscribed ? "Active" : `${days} days`}
      </Figure>
      <Lead>
        {firstName ? `${firstName}, your` : "Your"} Dobby Pro trial has started
        {alreadySubscribed ? " and your subscription is active" : ""}.
      </Lead>
      <Detail>
        {endsOn
          ? `It runs until ${endsOn}. Everything in Pro unlocks straight away — email auto-fetch, stablecoin wallets, proactive AI flags and tax advisory.`
          : "Everything in Pro unlocks straight away — email auto-fetch, stablecoin wallets, proactive AI flags and tax advisory."}
      </Detail>
      <Detail>
        {alreadySubscribed
          ? "Your card is on file and will be charged at the end of the period. You can cancel any time before then and keep Pro until the period ends."
          : "We will remind you before it ends. Your card is not charged until you choose to continue."}
      </Detail>
      <Cta href={appUrl("/app")}>Open Dobby</Cta>
      <Footnote>
        You are receiving this because a card subscription was created for your account.
        {firstName ? ` — ${firstName}` : ""}
      </Footnote>
    </Layout>
  );
}