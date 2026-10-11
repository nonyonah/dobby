import * as React from "react";
import { Cta, Detail, Figure, Footnote, Lead, Layout } from "../components.js";
import { appUrl } from "../links.js";

export type MonthInReviewInput = {
  firstName?: string | null;
  /** "June 2026", or "27 Jun - 26 Jul" for a partial month. */
  period: string;
  currency: string;
  /** Pre-formatted with the currency's own symbol, so it reads right for the country. */
  spent: string;
  income: string;
  net: string;
  topCategories: Array<{ name: string; amount: string }>;
  /** Rows waiting on the user. Drives the button. */
  needsReviewCount: number;
  uncategorizedLabel?: string | null;
  /** Only present when the user has a tax module for their country. */
  tax?: { amount: string; hasUnreviewedInflows: boolean } | null;
};

/**
 * The first-import summary — the one email that tries to be worth opening.
 *
 * Everything else we send is a receipt for something the user just did. This
 * is sent once, a few minutes after their first import, and it is the first
 * thing they see that looks back at their own money rather than at ours. So the
 * numbers lead, in the order someone actually wants them, and there is exactly
 * one button — on whatever they still have to decide.
 *
 * Transfers are excluded upstream and Uncategorized is kept out of the top
 * categories, because a category called Uncategorized with the largest number on
 * it would be reporting our failure as their spending.
 */
export function MonthInReviewEmail({
  firstName,
  period,
  spent,
  income,
  net,
  topCategories,
  needsReviewCount,
  uncategorizedLabel,
  tax,
}: MonthInReviewInput) {
  const greeting = firstName ? `Here’s your ${period}, ${firstName}.` : `Here’s your ${period}.`;
  const positive = !net.startsWith("-");
  const uncategorized = uncategorizedLabel ? [uncategorizedLabel] : [];

  return (
    <Layout preview={`${period}: ${spent} out, ${income} in, ${net} net.`}>
      <Figure tone="accent" caption={`Money out — ${period}`}>
        {spent}
      </Figure>
      <Lead>{greeting}</Lead>

      <Detail>
        You spent <strong>{spent}</strong>, took in <strong>{income}</strong>, and kept{" "}
        <strong>{positive ? net : net.replace(/^-/, "")}</strong> {positive ? "to the side" : "more than you took in"}.
      </Detail>

      {topCategories.length > 0 ? (
        <>
          <Detail>Where it went:</Detail>
          {topCategories.map((category) => (
            <Detail key={category.name}>
              {category.name} — {category.amount}
            </Detail>
          ))}
        </>
      ) : null}

      {uncategorized.length > 0 ? (
        <Detail>
          Plus <strong>{uncategorized[0]}</strong>, which we couldn’t place yet.
        </Detail>
      ) : null}

      {needsReviewCount > 0 ? (
        <Detail>
          <strong>
            {needsReviewCount} {needsReviewCount === 1 ? "transaction needs" : "transactions need"} a quick look
          </strong>{" "}
          — they aren’t counted in the totals above until you confirm them, so these figures may change after you review them.
        </Detail>
      ) : null}

      {tax ? (
        <Detail>
          Estimated tax so far: <strong>{tax.amount}</strong> (an estimate, not advice).
          {tax.hasUnreviewedInflows
            ? " Some money in is still unreviewed, so this can move."
            : ""}
        </Detail>
      ) : null}

      <Cta href={appUrl(needsReviewCount > 0 ? "/transactions?view=review" : "/insights")}>
        {needsReviewCount > 0 ? `Review ${needsReviewCount} transactions` : "See your insights"}
      </Cta>

      <Footnote>
        Totals exclude transfers between your own accounts. Everything you import stays yours — cancel any time.
      </Footnote>
    </Layout>
  );
}