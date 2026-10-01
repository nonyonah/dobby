import { Resend } from "resend";
import { render } from "@react-email/render";
import * as React from "react";
import { env } from "../config/env.js";
import { prisma } from "./prisma.js";
import { logger } from "./logger.js";
import { appUrl, formatMoney } from "../emails/links.js";
import { ImportCompleteEmail, ImportFailedEmail } from "../emails/templates/import-complete.js";
import { MonthlyTaxReminderEmail } from "../emails/templates/tax-reminder.js";
import { DeadlineReminderEmail } from "../emails/templates/deadline-reminder.js";

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
    await resend.emails.send({ from, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text });
    logger.info({ to: mail.to, subject: mail.subject }, "email sent");
    return true;
  } catch (error) {
    // The sending domain (e.g. riftlabs.xyz) may not be verified in Resend
    // (403 "domain is not verified"). Fall back to Resend's test sender,
    // which delivers to the Resend account owner — better than silence.
    if (isDomainNotVerified(error) && from !== RESEND_TEST_SENDER) {
      logger.warn({ to: mail.to, subject: mail.subject, from }, "sending domain unverified, retrying via Resend test sender");
      try {
        await resend.emails.send({ from: RESEND_TEST_SENDER, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text });
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
