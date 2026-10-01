import * as React from "react";
import { Cta, Detail, Figure, Footnote, Lead, Layout } from "../components.js";
import { appUrl } from "../links.js";
import { formatMoney } from "./format.js";

/**
 * Monthly tax reminder — the one that should feel most alive.
 *
 * It is the only email where the figure is the good news, so it leads with the
 * estimated tax in the success tone and pairs it with progress, because the two
 * together are the whole message: this is what you owe, and here is how ready
 * you are for it.
 */
export function MonthlyTaxReminderEmail({
  firstName,
  estimatedTaxOwed,
  currency,
  checklistReady,
  checklistTotal,
  jurisdictionLabel,
  taxYear,
}: {
  firstName?: string | null;
  estimatedTaxOwed: number;
  currency: string;
  checklistReady: number;
  checklistTotal: number;
  jurisdictionLabel: string;
  taxYear: number;
}) {
  const formatted = formatMoney(estimatedTaxOwed, currency);
  const allReady = checklistTotal > 0 && checklistReady >= checklistTotal;
  const noChecklist = checklistTotal === 0;

  return (
    <Layout preview={`Estimated ${jurisdictionLabel} tax for ${taxYear}: ${formatted}.`}>
      <Figure tone="success" caption={`Estimated ${jurisdictionLabel} tax · ${taxYear}`}>
        {formatted}
      </Figure>
      <Lead>
        {noChecklist
          ? "Your estimate is up to date."
          : allReady
            ? `Your ${taxYear} checklist is complete — nothing outstanding.`
            : `${checklistReady} of ${checklistTotal} documents ready.`}
      </Lead>
      <Detail>
        {allReady || noChecklist
          ? "Based on the transactions Dobby has imported, not a filed return."
          : `Tick off the rest and the estimate sharpens. ${taxYear} ${jurisdictionLabel} tax year.`}
      </Detail>
      <Cta href={appUrl("/insights")}>Review your checklist</Cta>
      <Footnote>
        An estimate from your imported transactions. Dobby does not prepare, file or submit returns.
        {firstName ? ` — ${firstName}` : ""}
      </Footnote>
    </Layout>
  );
}
