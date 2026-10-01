import * as React from "react";
import { Cta, Detail, Figure, Footnote, Lead, Layout } from "../components.js";
import { appUrl } from "../links.js";
import { deadlineCountdown, deadlineUrgency } from "../tokens.js";
import { formatMoney } from "./format.js";

/**
 * Filing deadline reminder — escalating.
 *
 * The tone, the weight and the wording all come from one `deadlineUrgency`
 * decision, so the styling cannot drift from the message. Thirty days out this
 * informs, in the calm brand accent. Inside a week it is direct: danger tone, a
 * figure that is a date rather than a number, and copy that says what happens
 * if the date passes. Same template, visibly different weight.
 */
export function DeadlineReminderEmail({
  firstName,
  deadlineLabel,
  daysRemaining,
  jurisdictionLabel,
  estimatedTaxOwed,
  currency,
  checklistReady,
  checklistTotal,
}: {
  firstName?: string | null;
  /** Human date, e.g. "31 January 2027". */
  deadlineLabel: string;
  daysRemaining: number;
  jurisdictionLabel: string;
  estimatedTaxOwed: number;
  currency: string;
  checklistReady: number;
  checklistTotal: number;
}) {
  const urgency = deadlineUrgency(daysRemaining);
  const close = daysRemaining <= 7;
  const overdue = daysRemaining <= 0;
  const formatted = formatMoney(estimatedTaxOwed, currency);

  // Far out there is nothing to act on beyond noting the date, so the figure is
  // the date. Close in, the money is the reason the date matters.
  const headline = close ? formatted : deadlineLabel;
  const caption = close ? `${jurisdictionLabel} tax due ${deadlineLabel}` : `${jurisdictionLabel} filing deadline`;
  const outstanding = Math.max(0, checklistTotal - checklistReady);

  const lead = overdue
    ? `${jurisdictionLabel} filing is past due.`
    : close
      ? `${jurisdictionLabel} tax is due ${deadlineCountdown(daysRemaining)}.`
      : `${jurisdictionLabel} filing is due ${deadlineCountdown(daysRemaining)}.`;

  const detail = overdue
    ? `${outstanding} document${outstanding === 1 ? "" : "s"} still outstanding on your checklist. Late filing usually carries a penalty — worth checking your ${jurisdictionLabel} Revenue Service's position.`
    : close
      ? outstanding > 0
        ? `${outstanding} document${outstanding === 1 ? "" : "s"} still outstanding. ${formatted} estimated to owe.`
        : `Your checklist is complete. ${formatted} estimated to owe.`
      : "Nothing to do yet — this is so the date does not arrive unannounced.";

  return (
    <Layout preview={`${jurisdictionLabel} filing ${deadlineLabel}.`}>
      <Figure tone={urgency.tone} caption={caption}>
        {headline}
      </Figure>
      <Lead>{lead}</Lead>
      <Detail>{detail}</Detail>
      <Cta href={appUrl("/insights")}>{close ? "Finish your checklist" : "Open your checklist"}</Cta>
      <Footnote>
        {urgency.label} · Dates are set by your {jurisdictionLabel} tax authority. Dobby does not file on your
        behalf.
        {firstName ? ` — ${firstName}` : ""}
      </Footnote>
    </Layout>
  );
}
