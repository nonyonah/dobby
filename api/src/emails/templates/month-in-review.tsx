import * as React from "react";
import { Cta, Detail, Divider, Figure, Footnote, Layout, Lead, LineItem, Meta, Title, TotalRow } from "../components.js";
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
 * Everything else we send is a receipt for something the user just did. This is
 * sent once, a few minutes after their first import, and it is the first thing
 * they see that looks back at their own money rather than at ours. So the figure
 * leads, the breakdown follows as an itemised statement they can scan down, and
 * there is exactly one button — on whatever they still have to decide.
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
  const positive = !net.startsWith("-");
  const kept = positive ? net : net.replace(/^-/, "");
  const greeting = firstName ? `Here is ${period}, ${firstName}.` : `Here is ${period}.`;

  return (
    <Layout preview={`${period}: ${spent} out, ${income} in, ${net} net.`}>
      <Title>Your {period}</Title>
      <Meta>
        {period}
        {needsReviewCount > 0 ? ` · ${needsReviewCount} awaiting your review` : " · nothing waiting"}
      </Meta>

      <Figure tone="accent" caption="Money out">
        {spent}
      </Figure>

      <Lead>{greeting}</Lead>
      <Detail>
        You spent <strong>{spent}</strong>, took in <strong>{income}</strong>, and kept{" "}
        <strong>{kept}</strong> {positive ? "to the side." : "less than came in."}
      </Detail>

      {topCategories.length > 0 ? (
        <>
          <Divider />
          <LineItem label="Money out" value={spent} />
          <LineItem label="Money in" value={income} />
          {topCategories.map((category) => (
            <LineItem key={category.name} label={category.name} value={category.amount} />
          ))}
          <TotalRow label={positive ? "Kept" : "Spent over what came in"} value={kept} />
        </>
      ) : null}

      {uncategorizedLabel ? (
        <Detail>
          Plus <strong>{uncategorizedLabel}</strong>, which we could not place yet.
        </Detail>
      ) : null}

      {needsReviewCount > 0 ? (
        <>
          <Divider />
          <Detail>
            <strong>
              {needsReviewCount} {needsReviewCount === 1 ? "transaction needs" : "transactions need"} a quick look
            </strong>
            . They are not counted above until you confirm them, so these figures may move once you do.
          </Detail>
        </>
      ) : null}

      {tax ? (
        <>
          <Divider />
          <LineItem label="Estimated tax so far" value={tax.amount} />
        </>
      ) : null}

      <Cta href={appUrl(needsReviewCount > 0 ? "/transactions?view=review" : "/insights")}>
        {needsReviewCount > 0 ? `Review ${needsReviewCount} transactions` : "See your insights"}
      </Cta>

      <Footnote>
        An estimate from your own transactions, not advice. Totals exclude transfers between your
        accounts, and everything you import stays yours.
      </Footnote>
    </Layout>
  );
}