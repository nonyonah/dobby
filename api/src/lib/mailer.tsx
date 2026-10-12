import { Resend } from "resend";
import { render } from "@react-email/render";
import * as React from "react";
import { env } from "../config/env.js";
import { prisma } from "./prisma.js";
import { logger } from "./logger.js";
import { appUrl, formatMoney } from "../emails/links.js";
import { MonthInReviewEmail } from "../emails/templates/month-in-review.js";
import { buildInsightsSummary } from "./transaction-summary.js";
import { getConversionFactors } from "../providers/frankfurter.js";
import { getTaxRules } from "../tax/registry.js";
import { TRIAL_DAYS } from "../middleware/plan.js";
import { ImportCompleteEmail, ImportFailedEmail } from "../emails/templates/import-complete.js";
import { TrialStartedEmail } from "../emails/templates/trial-started.js";
import { MonthlyTaxReminderEmail } from "../emails/templates/tax-reminder.js";
import { DeadlineReminderEmail } from "../emails/templates/deadline-reminder.js";
import { NudgeEmail } from "../emails/templates/nudge.js";
import { WelcomeEmail } from "../emails/templates/welcome.js";
import { WhatsNewEmail } from "../emails/templates/whats-new.js";
import { WinBackEmail } from "../emails/templates/win-back.js";

export function mailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL);
}

type Mail = { to: string; subject: string; html: string; text: string };

/**
 * Best-effort send. Returns false when unconfigured or the send fails, and
 * never throws — a notification must not be able to fail an import.
 *
 * Both an HTML part and a plain-text part go out. The text part is not a
 * formality: it is what a screen reader and a plain-text client get, and it is
 * the part that survives an email client that cannot render the template.
 */
export async function sendEmail(mail: Mail): Promise<boolean> {
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    logger.info({ to: mail.to, subject: mail.subject }, "email skipped: RESEND_NOT_CONFIGURED");
    return false;
  }
  const resend = new Resend(apiKey);
  try {
    await resend.emails.send({ from: withDisplayName(from), to: mail.to, subject: mail.subject, html: mail.html, text: mail.text });
    logger.info({ to: mail.to, subject: mail.subject }, "email sent");
    return true;
  } catch (error) {
    // The sending domain (e.g. riftlabs.xyz) may not be verified in Resend
    // (403 "domain is not verified"). Fall back to Resend's test sender,
    // which delivers to the Resend account owner — better than silence.
    if (isDomainNotVerified(error) && from !== RESEND_TEST_SENDER) {
      logger.warn({ to: mail.to, subject: mail.subject, from }, "sending domain unverified, retrying via Resend test sender");
      try {
        await resend.emails.send({ from: withDisplayName(RESEND_TEST_SENDER), to: mail.to, subject: mail.subject, html: mail.html, text: mail.text });
        logger.info({ to: mail.to, subject: mail.subject }, "email sent via Resend test sender");
        return true;
      } catch (fallbackError) {
        logger.warn(
          { to: mail.to, subject: mail.subject, error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError) },
          "test-sender fallback failed — verify the domain at https://resend.com/domains (SPF + DKIM)",
        );
        return false;
      }
    }
    logger.warn({ to: mail.to, subject: mail.subject, error: error instanceof Error ? error.message : String(error) }, "email send failed");
    return false;
  }
}

/** Renders a React Email template to the HTML/text pair `sendEmail` expects. */
async function renderMail(element: React.ReactElement, text: string): Promise<{ html: string; text: string }> {
  try {
    return { html: await render(element), text };
  } catch (error) {
    // A template that fails to render must not take the notification with it;
    // the plain-text part still goes out.
    logger.warn({ error: error instanceof Error ? error.message : String(error) }, "email template failed to render; sending text only");
    return { html: `<p>${escapeHtml(text).replace(/\n/g, "<br />")}</p>`, text };
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Resend's sender for unverified domains — only reaches the account owner. */
export const RESEND_TEST_SENDER = "onboarding@resend.dev";

/**
 * The name a sender shows as, not the address.
 *
 * Resend derives the display name from the local part when the address is given
 * bare, so `dobby@dobby.riftlabs.xyz` arrived reading as "dobby". Adding the
 * display name here rather than in the env value means every environment gets
 * "Dobby" without being edited separately, and an address that already carries
 * one is left alone.
 */
const SENDER_NAME = "Dobby";

function withDisplayName(from: string): string {
  return from.includes("<") ? from : `${SENDER_NAME} <${from}>`;
}

/** Matches Resend's 403 "domain is not verified" validation error. */
export function isDomainNotVerified(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /domain is not verified/i.test(message);
}

/** The address reminders go to — null when the user never shared one. */
export async function userEmailAddress(ownerClerkId: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({ where: { clerkId: ownerClerkId }, select: { email: true } });
    return user?.email ?? null;
  } catch {
    return null;
  }
}

async function firstNameFor(ownerClerkId: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({ where: { clerkId: ownerClerkId }, select: { firstName: true } });
    return user?.firstName ?? null;
  } catch {
    return null;
  }
}

/** "Your file finished importing" — success, already-imported, and failure. */
export async function notifyImportComplete(
  ownerClerkId: string,
  summary: { filename: string; rowCount: number; reviewCount: number; failed?: string; duplicate?: boolean },
): Promise<void> {
  const to = await userEmailAddress(ownerClerkId);
  if (!to) return;
  const firstName = await firstNameFor(ownerClerkId);

  if (summary.failed) {
    const text = [
      `${summary.filename} could not be imported: ${summary.failed}`,
      "Nothing was added to your ledger.",
      "If the file is password-protected, remove the password first.",
      "",
      appUrl("/transactions"),
    ].join("\n");
    const { html, text: plain } = await renderMail(
      <ImportFailedEmail firstName={firstName} filename={summary.filename} reason={summary.failed} />,
      text,
    );
    await sendEmail({ to, subject: `Dobby: couldn't import ${summary.filename}`, html, text: plain });
    return;
  }

  if (summary.duplicate) {
    const text = [
      `${summary.filename} looks like a statement you have already imported, so nothing was added.`,
      "That keeps your totals honest — the same statement twice would double-count it.",
      "",
      appUrl("/transactions"),
    ].join("\n");
    const { html, text: plain } = await renderMail(
      <ImportCompleteEmail
        firstName={firstName}
        filename={summary.filename}
        importedCount={0}
        reviewCount={0}
        duplicate
      />,
      text,
    );
    await sendEmail({ to, subject: `Dobby: ${summary.filename} was already imported`, html, text: plain });
    return;
  }

  const needsReview = summary.reviewCount > 0;
  const text = [
    `${summary.rowCount} transaction${summary.rowCount === 1 ? "" : "s"} imported from ${summary.filename}.`,
    needsReview
      ? `${summary.reviewCount} need your review before they count.`
      : "All of them were categorised automatically — nothing is waiting for you.",
    "",
    appUrl("/transactions"),
  ].join("\n");
  const { html, text: plain } = await renderMail(
    <ImportCompleteEmail
      firstName={firstName}
      filename={summary.filename}
      importedCount={summary.rowCount}
      reviewCount={summary.reviewCount}
    />,
    text,
  );
  await sendEmail({
    to,
    subject: needsReview
      ? `Dobby: ${summary.rowCount} imported from ${summary.filename}, ${summary.reviewCount} need review`
      : `Dobby: ${summary.rowCount} transactions imported`,
    html,
    text: plain,
  });
}

/**
 * The first-import month in review — sent once, a few minutes after a user's
 * first import finishes.
 *
 * Every figure comes from `buildInsightsSummary`, the same call the Insights
 * overview and cash flow use. Writing a second calculation here would be the
 * kind of drift that ends with the email disagreeing with the screen the user
 * is reading, and neither of them would be obviously wrong.
 */
export async function sendMonthInReviewNotification(input: {
  ownerClerkId: string;
  /** When to summarise up to. The import's own window, or a full calendar month. */
  from: Date;
  to: Date;
}): Promise<boolean> {
  const to_address = await userEmailAddress(input.ownerClerkId);
  if (!to_address) return false;
  const firstName = await firstNameFor(input.ownerClerkId);
  const summary = await buildInsightsSummary(input.ownerClerkId, input.from, input.to);

  const { currency, totals, spendingByCategory } = summary;
  // Uncategorized is excluded from the top three on purpose: it is our failure
  // to categorise, not a spending category, and leading with it would report it
  // as the largest thing they spent.
  const topCategories = spendingByCategory
    .filter((category) => category.categoryId !== null && !/^uncategorized$/i.test(category.name))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)
    .map((category) => ({ name: category.name, amount: formatMoney(category.amount, currency) }));

  const uncategorized = spendingByCategory.find(
    (category) => category.categoryId === null || /^uncategorized$/i.test(category.name),
  );
  const unreviewed = totals.uncategorizedIncome + totals.uncategorizedExpenses > 0;
  const needsReview = await countNeedingReview(input.ownerClerkId, input.from, input.to);

  // Only when the user actually has a tax module for their country — an estimate
  // with no jurisdiction behind it is a guess dressed as a number.
  const taxProfile = await prisma.taxProfile.findUnique({
    where: { ownerClerkId: input.ownerClerkId },
    select: { country: true, estimatedTaxOwed: true },
  });
  // Each jurisdiction states its own currency, as it does everywhere else in
  // the tax module; an estimate converted into the wrong symbol is worse than
  // no estimate at all.
  const taxCurrency = taxProfile ? getTaxRules(taxProfile.country).currency : currency;
  const taxFactors = taxCurrency === currency ? null : await getConversionFactors([currency], taxCurrency);
  const taxAmount =
    taxProfile && taxProfile.estimatedTaxOwed
      ? Number(taxProfile.estimatedTaxOwed) * (taxFactors?.get(currency.toUpperCase()) ?? 1)
      : null;

  const period = periodLabel(input.from, input.to);
  const net = totals.net;
  const text = [
    `Here is your ${period}.`,
    `Out: ${formatMoney(totals.expenses, currency)}. In: ${formatMoney(totals.income, currency)}. Net: ${formatMoney(net, currency)}.`,
    ...topCategories.map((category) => `${category.name}: ${category.amount}`),
    unreviewed ? "Some money is still uncategorized, so these totals can move." : "",
    needsReview > 0 ? `${needsReview} waiting for you.` : "",
    taxAmount !== null ? `Estimated tax so far: ${formatMoney(taxAmount, taxCurrency)} (an estimate, not advice).` : "",
    appUrl("/insights"),
  ]
    .filter(Boolean)
    .join("\n");

  const { html, text: plain } = await renderMail(
    <MonthInReviewEmail
      firstName={firstName}
      period={period}
      currency={currency}
      spent={formatMoney(totals.expenses, currency)}
      income={formatMoney(totals.income, currency)}
      net={formatMoney(net, currency)}
      topCategories={topCategories}
      needsReviewCount={needsReview}
      uncategorizedLabel={uncategorized ? "Uncategorized" : null}
      tax={taxAmount !== null ? { amount: formatMoney(taxAmount, taxCurrency), hasUnreviewedInflows: unreviewed } : null}
    />,
    text,
  );

  await sendEmail({
    to: to_address,
    subject: `Your ${period} in review: ${formatMoney(totals.expenses, currency)} out, ${formatMoney(totals.income, currency)} in`,
    html,
    text: plain,
  });
  return true;
}

/**
 * Rows still waiting on the user: uncategorized, or flagged for review.
 *
 * Counted directly rather than inferred from the totals, because the button
 * copy says "Review N transactions" and that N has to be the number of rows the
 * queue will actually show.
 */
async function countNeedingReview(ownerClerkId: string, from: Date, to: Date): Promise<number> {
  const uncategorized = await prisma.category.findMany({
    where: { ownerClerkId, name: { equals: "uncategorized", mode: "insensitive" } },
    select: { id: true },
  });
  const ids = uncategorized.map((category) => category.id);
  return prisma.transaction.count({
    where: {
      ownerClerkId,
      occurredAt: { gte: from, lt: to },
      OR: [{ needsReview: true }, ...(ids.length > 0 ? [{ categoryId: { in: ids } }] : [])],
    },
  });
}

/**
 * "June 2026" for a full calendar month, "27 Jun - 26 Jul" for a partial one.
 *
 * A statement that covers part of a month is labelled by its own dates rather
 * than by the month it happened to fall in — calling a fortnight "June" would be
 * the kind of small untruth that makes the whole email feel unreliable.
 */
function periodLabel(from: Date, to: Date): string {
  const sameMonth = from.getUTCMonth() === to.getUTCMonth() && from.getUTCFullYear() === to.getUTCFullYear();
  if (sameMonth && from.getUTCDate() === 1) {
    return from.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${day.format(from)} - ${day.format(to)}`;
}

/**
 * The trial clock has just started (or a paid subscription became active).
 *
 * Reads the persisted `trialStartedAt` back rather than trusting a date passed
 * in, so the end date in the email is derived from the same row the plan logic
 * bills against — if the two ever disagreed the email would be the thing that
 * is obviously wrong to the customer.
 */
export async function notifyTrialStarted(ownerClerkId: string, status: string): Promise<boolean> {
  const to = await userEmailAddress(ownerClerkId);
  if (!to) return false;
  const firstName = await firstNameFor(ownerClerkId);

  let endsOn: string | null = null;
  try {
    const row = await prisma.user.findUnique({
      where: { clerkId: ownerClerkId },
      select: { trialStartedAt: true, trialEndsAt: true },
    });
    // Read from the stored trial window rather than recomputed, so the date in
    // the email is the same one the gate is enforcing.
    const end = row?.trialEndsAt ?? null;
    endsOn = end
      ? end.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })
      : null;
  } catch {
    endsOn = null;
  }

  const alreadySubscribed = status !== "trial";
  const text = [
    alreadySubscribed
      ? "Thanks for subscribing — Dobby Pro is active."
      : `Your ${TRIAL_DAYS}-day Dobby Pro trial has started.`,
    endsOn ? `It runs until ${endsOn}.` : "Everything in Pro is unlocked straight away.",
    alreadySubscribed
      ? "Your card is on file and will be charged at the end of the period. You can cancel any time before then."
      : "We will remind you before it ends. Your card is not charged until you choose to continue.",
    "",
    appUrl("/app"),
  ].join("\n");

  const { html, text: plain } = await renderMail(
    <TrialStartedEmail firstName={firstName} days={TRIAL_DAYS} endsOn={endsOn} alreadySubscribed={alreadySubscribed} />,
    text,
  );
  return sendEmail({
    to,
    subject: alreadySubscribed ? "Dobby: your subscription is active" : `Dobby: your ${TRIAL_DAYS}-day trial has started`,
    html,
    text: plain,
  });
}

export type EmailSyncCounts = { scanned: number; imported: number; duplicates: number; skipped: number; failed: number };

/**
 * "Your mailbox sync finished". Sent only when the run actually did something —
 * a scan that found nothing new is not news.
 */
export async function notifyEmailSyncComplete(ownerClerkId: string, provider: string, counts: EmailSyncCounts): Promise<void> {
  if (counts.scanned === 0 || counts.imported === 0) return;
  const to = await userEmailAddress(ownerClerkId);
  if (!to) return;
  const firstName = await firstNameFor(ownerClerkId);
  const box = provider === "gmail" ? "Gmail" : "Outlook";
  const text = [
    `${counts.imported} new transaction${counts.imported === 1 ? "" : "s"} imported from ${box}.`,
    `${counts.duplicates} already in your ledger · ${counts.skipped} skipped.`,
    "Password-protected statements show up in your review queue with instructions.",
    "",
    appUrl("/transactions"),
  ].join("\n");
  const { html, text: plain } = await renderMail(
    <ImportCompleteEmail
      firstName={firstName}
      filename={box}
      importedCount={counts.imported}
      reviewCount={counts.duplicates}
    />,
    text,
  );
  await sendEmail({ to, subject: `Dobby: ${counts.imported} new from ${box}`, html, text: plain });
}


/**
 * Monthly tax reminder — the headline number plus how ready the checklist is.
 *
 * Takes the facts rather than an owner id: the job has already loaded and
 * plan-gated the profile, and querying it again here would both duplicate that
 * work and lose the gating context.
 */
export async function sendMonthlyTaxNotification(input: {
  to: string;
  firstName?: string | null;
  estimatedTaxOwed: number;
  currency: string;
  checklistReady: number;
  checklistTotal: number;
  jurisdictionLabel: string;
  taxYear: number;
}): Promise<boolean> {
  const ready = input.checklistReady;
  const total = input.checklistTotal;
  const allReady = total > 0 && ready >= total;
  const text = [
    `Estimated ${input.jurisdictionLabel} tax for ${input.taxYear}: ${formatMoney(input.estimatedTaxOwed, input.currency)}.`,
    total === 0 ? "Your estimate is up to date." : allReady ? "Your checklist is complete." : `${ready} of ${total} documents ready.`,
    "Based on the transactions Dobby has imported — Dobby does not file returns.",
    "",
    appUrl("/insights"),
  ].join("\n");
  const { html, text: plain } = await renderMail(
    <MonthlyTaxReminderEmail
      firstName={input.firstName}
      estimatedTaxOwed={input.estimatedTaxOwed}
      currency={input.currency}
      checklistReady={ready}
      checklistTotal={total}
      jurisdictionLabel={input.jurisdictionLabel}
      taxYear={input.taxYear}
    />,
    text,
  );
  return sendEmail({
    to: input.to,
    subject: `Dobby: ${input.jurisdictionLabel} tax estimate for ${input.taxYear}`,
    html,
    text: plain,
  });
}

/**
 * Filing deadline reminder. `daysRemaining` drives tone, weight and wording
 * from one place in the template, so a scheduler can fire 30-day, 7-day and
 * overdue runs without choosing how urgent each should look.
 */
export async function sendDeadlineNotification(input: {
  to: string;
  firstName?: string | null;
  deadlineLabel: string;
  daysRemaining: number;
  jurisdictionLabel: string;
  estimatedTaxOwed: number;
  currency: string;
  checklistReady: number;
  checklistTotal: number;
  subject: string;
}): Promise<boolean> {
  const ready = input.checklistReady;
  const total = input.checklistTotal;
  const text = [
    `${input.jurisdictionLabel} filing is due ${input.daysRemaining <= 0 ? "now" : `in ${input.daysRemaining} day${input.daysRemaining === 1 ? "" : "s"}`} (${input.deadlineLabel}).`,
    `${ready} of ${total} documents ready.`,
    "Dates are set by your tax authority — Dobby does not file on your behalf.",
    "",
    appUrl("/insights"),
  ].join("\n");
  const { html, text: plain } = await renderMail(
    <DeadlineReminderEmail
      firstName={input.firstName}
      deadlineLabel={input.deadlineLabel}
      daysRemaining={input.daysRemaining}
      jurisdictionLabel={input.jurisdictionLabel}
      estimatedTaxOwed={input.estimatedTaxOwed}
      currency={input.currency}
      checklistReady={ready}
      checklistTotal={total}
    />,
    text,
  );
  return sendEmail({ to: input.to, subject: input.subject, html, text: plain });
}

/**
 * One-time payment confirmed.
 *
 * A receipt rather than a nudge: it says what was bought, what it cost and the
 * date access runs out, because "Pay once" has no renewal and no card on file —
 * this email is the only place that end date is stated plainly.
 */
export async function notifyOneTimePayment(ownerClerkId: string, endsAt: Date): Promise<void> {
  const to = await userEmailAddress(ownerClerkId);
  if (!to) return;
  const firstName = await firstNameFor(ownerClerkId);
  const endsOn = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(endsAt);

  const text = [
    firstName ? `${firstName}, your payment came through.` : "Your payment came through.",
    `Dobby Pro is active until ${endsOn}.`,
    "Nothing is charged automatically — renew whenever you want to keep it going, or switch to a card subscription and let it renew on its own.",
    "",
    appUrl("/app"),
  ].join("\n");

  const { html, text: plain } = await renderMail(
    <NudgeEmail
      firstName={firstName}
      subject="Your Pro access is active"
      headline="Your Pro access is active"
      body={`Dobby Pro runs until ${endsOn}. Nothing is charged automatically — renew whenever you want to keep it going, or switch to a card subscription and let it renew on its own.`}
      ctaLabel="Open Dobby"
      ctaHref={appUrl("/app")}
      preferencesHref={appUrl("/settings#notifications")}
    />,
    text,
  );
  await sendEmail({ to, subject: "Dobby: your Pro access is active", html, text: plain });
}

/**
 * A crypto payment that arrived short.
 *
 * Leads with what happened and what is still owed, because the customer can fix
 * this themselves by sending the remainder to the same reference. No refund is
 * offered or implied: the payment was not wrong, it was incomplete.
 */
export async function notifyUnderpaid(
  ownerClerkId: string,
  amounts: { amountPaid: string | null; amountExpected: string | null; amountRemaining: string | null; currency: string },
): Promise<void> {
  const to = await userEmailAddress(ownerClerkId);
  if (!to) return;
  const firstName = await firstNameFor(ownerClerkId);
  const short = amounts.amountRemaining ? formatMoney(Number(amounts.amountRemaining), amounts.currency) : null;

  const text = [
    firstName ? `${firstName}, your payment was received but it came in short.` : "Your payment was received but it came in short.",
    short ? `${short} is still outstanding.` : "There is a shortfall on this payment.",
    "Send the remainder using the same payment reference and it will complete automatically. Pro starts as soon as it does.",
    "",
    appUrl("/settings#plan"),
  ].join("\n");

  const { html, text: plain } = await renderMail(
    <NudgeEmail
      firstName={firstName}
      subject="Your payment came in short"
      headline="Your payment came in short"
      body={`${short ? `${short} is still outstanding. ` : ""}Send the remainder using the same payment reference and it will complete automatically. Pro starts as soon as it does.`}
      ctaLabel="Complete payment"
      ctaHref={appUrl("/settings#plan")}
      preferencesHref={appUrl("/settings#notifications")}
    />,
    text,
  );
  await sendEmail({ to, subject: "Dobby: your payment came in short", html, text: plain });
}

/**
 * Marketing sends. Same shell, same tokens and the same 50px control radius as
 * the transactional mail, so a campaign and a receipt are visibly the same
 * product to someone reading both.
 *
 * Kept apart from the transactional senders on purpose: these are scheduled and
 * speakable, those are triggered and factual. A receipt that reads like a
 * campaign trains people to distrust receipts.
 */

/**
 * The currency this account chose in Settings.
 *
 * Every amount in an email is rendered in it, so a customer who set NGN reads
 * ₦ and not a bare number. Falls back to USD, which is what the profile column
 * itself defaults to.
 */
async function currencyFor(ownerClerkId: string): Promise<string> {
  try {
    const profile = await prisma.profile.findUnique({ where: { clerkId: ownerClerkId }, select: { currency: true } });
    return (profile?.currency ?? "USD").toUpperCase();
  } catch {
    // Never let a settings read change whether an email goes out; USD is the
    // profile's own default, so this is the same answer in practice.
    return "USD";
  }
}

export async function sendWelcome(
  ownerClerkId: string,
  summary: { importedCount: number; categoriesFound: Array<{ name: string; amount: number }>; nextPath?: string | null },
): Promise<void> {
  const to = await userEmailAddress(ownerClerkId);
  if (!to) return;
  const firstName = await firstNameFor(ownerClerkId);
  const currency = await currencyFor(ownerClerkId);

  const { html, text } = await renderMail(
    <WelcomeEmail
      firstName={firstName}
      currency={currency}
      importedCount={summary.importedCount}
      categoriesFound={summary.categoriesFound.map((category) => ({
        name: category.name,
        amount: formatMoney(category.amount, currency),
      }))}
      nextPath={summary.nextPath}
    />,
    [
      firstName ? `${firstName}, you're set up.` : "You're set up.",
      `Dobby sorted ${summary.importedCount} transactions into categories.`,
      "Nothing was deleted and every row is yours to change.",
      "",
      appUrl(summary.nextPath ?? "/insights"),
    ].join("\n"),
  );
  await sendEmail({ to, subject: "You're set up — here's what Dobby found", html, text });
}

export async function sendWhatsNew(
  ownerClerkId: string,
  input: { releaseName: string; notes: Array<{ title: string; body: string }>; href?: string | null },
): Promise<void> {
  const to = await userEmailAddress(ownerClerkId);
  if (!to) return;
  const firstName = await firstNameFor(ownerClerkId);

  const { html, text } = await renderMail(
    <WhatsNewEmail firstName={firstName} releaseName={input.releaseName} notes={input.notes} href={input.href} />,
    [input.releaseName, "", ...input.notes.map((note) => `${note.title} — ${note.body}`), "", appUrl(input.href ?? "/app")].join("\n"),
  );
  await sendEmail({ to, subject: `${input.releaseName} — what's new in Dobby`, html, text });
}

export async function sendWinBack(
  ownerClerkId: string,
  input: { daysAway: number; daysSinceFirstImport: number | null },
): Promise<void> {
  const to = await userEmailAddress(ownerClerkId);
  if (!to) return;
  const firstName = await firstNameFor(ownerClerkId);

  const { html, text } = await renderMail(
    <WinBackEmail firstName={firstName} daysAway={input.daysAway} daysSinceFirstImport={input.daysSinceFirstImport} />,
    [
      firstName ? `${firstName}, nothing changed while you were away.` : "Nothing changed while you were away.",
      "Your imports, categories and ledger are exactly where you left them.",
      "",
      appUrl("/transactions"),
    ].join("\n"),
  );
  await sendEmail({ to, subject: "Your Dobby data is still here", html, text });
}
