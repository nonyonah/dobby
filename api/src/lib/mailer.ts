import { Resend } from "resend";
import { env } from "../config/env.js";
import { prisma } from "./prisma.js";
import { logger } from "./logger.js";

export function mailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL);
}

/** Best-effort email: returns false when unconfigured or sending fails. Never throws. */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    logger.info({ to, subject }, "email skipped: RESEND_NOT_CONFIGURED");
    return false;
  }
  try {
    await new Resend(apiKey).emails.send({ from, to, subject, text });
    logger.info({ to, subject }, "email sent");
    return true;
  } catch (error) {
    logger.warn({ to, subject, error: error instanceof Error ? error.message : String(error) }, "email send failed");
    return false;
  }
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

/** "Your file finished importing" — success and failure. Fire-and-forget. */
export async function notifyImportComplete(
  ownerClerkId: string,
  summary: { filename: string; rowCount: number; reviewCount: number; failed?: string },
): Promise<void> {
  const to = await userEmailAddress(ownerClerkId);
  if (!to) return;
  if (summary.failed) {
    await sendEmail(
      to,
      `Dobby: couldn't import ${summary.filename}`,
      `Your import of ${summary.filename} failed: ${summary.failed}\n\nFix the file and try again — nothing was added to your ledger.`,
    );
    return;
  }
  await sendEmail(
    to,
    `Dobby: ${summary.filename} imported (${summary.rowCount} rows)`,
    [
      `Your import of ${summary.filename} is done: ${summary.rowCount} rows, ${summary.reviewCount} waiting in your review queue.`,
      "",
      "Open Transactions to approve them. Dobby never files anything on your behalf.",
    ].join("\n"),
  );
}

export type EmailSyncCounts = { scanned: number; imported: number; duplicates: number; skipped: number; failed: number };

/** "Your mailbox sync finished" — one summary per run, only when it scanned anything. */
export async function notifyEmailSyncComplete(ownerClerkId: string, provider: string, counts: EmailSyncCounts): Promise<void> {
  if (counts.scanned === 0) return;
  const to = await userEmailAddress(ownerClerkId);
  if (!to) return;
  const box = provider === "gmail" ? "Gmail" : "Outlook";
  await sendEmail(
    to,
    `Dobby: ${box} sync finished — ${counts.imported} imported`,
    [
      `Your ${box} sync scanned ${counts.scanned} emails: ${counts.imported} imported, ${counts.duplicates} already in your ledger, ${counts.skipped} skipped, ${counts.failed} failed.`,
      "Password-protected statements show up in your review queue with instructions.",
      "",
      "Open Transactions to approve the new rows.",
    ].join("\n"),
  );
}
