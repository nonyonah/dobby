import * as React from "react";
import { Cta, Detail, Divider, Footnote, Layout, LineItem, Lead, Meta, Title } from "../components.js";
import { appUrl } from "../links.js";

/**
 * Welcome — sent once, after the first import lands.
 *
 * Marketing in the loosest sense: there is nothing to sell yet, so the only job
 * is to make the second action obvious. Every claim here is something the
 * product has already done for them, because a welcome email that lists features
 * they have not seen reads as a brochure.
 */
export function WelcomeEmail({
  firstName,
  currency,
  importedCount,
  categoriesFound,
  nextPath,
}: {
  firstName?: string | null;
  /** The account's Settings currency. Every amount below is rendered in it. */
  currency: string;
  importedCount: number;
  /** Categories Dobby worked out on its own, used to show the work it did. */
  categoriesFound: Array<{ name: string; amount: string }>;
  /** Where the button goes. Insights once there is data to look at. */
  nextPath?: string | null;
}) {
  const greeting = firstName ? `You're set up, ${firstName}.` : "You're set up.";
  const path = nextPath ?? "/insights";

  return (
    <Layout preview={`${importedCount} transactions sorted. Here's what Dobby found.`}>
      <Title>You're in</Title>
      <Meta>{importedCount} transactions, categorised · {currency}</Meta>

      <Lead>{greeting}</Lead>
      <Detail>
        Dobby has read your statement and sorted it into categories on its own. Nothing
        is deleted, and every row is still yours to change.
      </Detail>

      {categoriesFound.length > 0 ? (
        <>
          <Divider />
          {categoriesFound.map((category) => (
            <LineItem key={category.name} label={category.name} value={category.amount} />
          ))}
        </>
      ) : null}

      <Cta href={appUrl(path)}>See where your money went</Cta>

      <Footnote>
        Dobby never moves your money or files anything on your behalf. You stay in control of
        every category.
      </Footnote>
    </Layout>
  );
}