import * as React from "react";
import { Cta, Detail, Divider, Figure, Footnote, Layout, Lead, LineItem, Meta, Title, TotalRow } from "../components.js";
import { appUrl } from "../links.js";

/**
 * Trial started.
 *
 * This is the first email a new subscriber should receive, so it confirms the
 * one thing that is easy to get wrong: the trial is attached to the account they
 * just started, not to the day they created it. Someone who signed up weeks ago
 * and only now started should understand why their days begin now rather than
 * feeling short-changed.
 *
 * `endsOn` is computed by the caller from the persisted clock rather than
 * assumed here, so the date in the email is the same date the product bills
 * against. Copy reads the length from the server rather than restating it.
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
  /** True when the payment produced a paid subscription rather than a trial. */
  alreadySubscribed?: boolean;
}) {
  const preview = alreadySubscribed
    ? "Thanks for subscribing — Dobby Pro is active."
    : `Your ${days}-day Dobby Pro trial has started.`;

  return (
    <Layout preview={preview}>
      <Title>{alreadySubscribed ? "Dobby Pro is active" : "Your trial has started"}</Title>
      <Meta>
        {alreadySubscribed ? "Subscription confirmed" : `${days}-day free trial`}
        {endsOn ? ` · ends ${endsOn}` : ""}
      </Meta>

      <Figure tone="accent" caption={alreadySubscribed ? "Pro is active" : "Days of Pro ahead"}>
        {alreadySubscribed ? "Active" : days}
      </Figure>

      <Lead>{firstName ? `${firstName}, Pro is unlocked.` : "Pro is unlocked."}</Lead>
      <Detail>
        Everything below is available straight away, for as long as the trial runs. Nothing is
        charged unless you decide to continue.
      </Detail>

      <Divider />
      <LineItem label="Email auto-fetch" value="New statements, on their own" />
      <LineItem label="Stablecoin wallets" value="On-chain in the same ledger" />
      <LineItem label="Proactive AI flags" value="Only when something looks wrong" />
      <LineItem label="Tax advisory" value="Scoped to your jurisdiction" />

      <Cta href={appUrl("/app")}>Open Dobby</Cta>

      <Footnote>
        {alreadySubscribed
          ? "Your card is on file and is charged at the end of the period. Cancel any time before then and Pro continues to the end of it."
          : "We will remind you before the trial ends. No card is on file and nothing is charged."}
      </Footnote>
    </Layout>
  );
}
