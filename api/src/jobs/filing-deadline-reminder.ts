import { Plan } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { mailConfigured, sendEmail } from "../lib/mailer.js";
import { logger } from "../lib/logger.js";
import { computeEffectivePlan } from "../middleware/plan.js";

export const DEADLINE_MARKS = [30, 14, 7, 1] as const;
export const OVERDUE_MARK = -1;

/**
 * Filing deadline per jurisdiction. Mirrors the rule modules
 * (src/tax/nigeria.ts: March 31, src/tax/us.ts: April 15, both of taxYear + 1).
 */
export function filingDeadlineFor(country: string, taxYear: number): string {
  return country === "US" ? `${taxYear + 1}-04-15` : `${taxYear + 1}-03-31`;
}

/**
 * Whole days until the deadline end (negative once past). Ceil going forward
 * so "tomorrow" reads 1, floor going back so 2 seconds past reads -1 — plain
 * Math.ceil turns that into -0, which compares equal to 0.
 */
export function daysBeforeDeadline(deadlineIso: string, now: Date): number {
  const ms = new Date(`${deadlineIso}T23:59:59Z`).getTime() - now.getTime();
  return ms >= 0 ? Math.ceil(ms / 86_400_000) : Math.floor(ms / 86_400_000);
}

/**
 * Which reminder mark a deadline falls in right now: 30/14/7/1, -1 once it is
 * past, or null when it is too far out. Windows (not exact days) so a user
 * who joins mid-cycle still gets the current window's notice exactly once.
 */
export function markForDeadline(deadlineIso: string, now: Date): number | null {
  const daysLeft = daysBeforeDeadline(deadlineIso, now);
  if (daysLeft < 0) return OVERDUE_MARK;
  if (daysLeft <= 1) return 1;
  if (daysLeft <= 7) return 7;
  if (daysLeft <= 14) return 14;
  if (daysLeft <= 30) return 30;
  return null;
}

export function deadlineEmail(input: {
  country: string;
  taxYear: number;
  deadline: string;
  daysLeft: number;
  estimatedTaxOwed: string;
  outstanding: string[];
}): { subject: string; text: string } {
  const when = new Date(`${input.deadline}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const headline =
    input.daysLeft < 0
      ? `Your ${input.taxYear} tax filing deadline (${when}) has passed`
      : input.daysLeft <= 1
        ? `Your ${input.taxYear} tax filing deadline is ${input.daysLeft === 0 ? "today" : "tomorrow"} (${when})`
        : `${input.daysLeft} days left to file your ${input.taxYear} taxes (deadline ${when})`;
  const lines = [
    headline,
    "",
    `Estimated tax owed: ${input.estimatedTaxOwed} (informational estimate only).`,
    input.outstanding.length > 0
      ? `Outstanding documents (${input.outstanding.length}):\n${input.outstanding.map((label) => `- ${label}`).join("\n")}`
      : "All checklist documents are marked ready.",
    "",
    "Please confirm your records with a qualified tax professional. Dobby doesn't prepare or file returns.",
  ];
  return {
    subject: input.daysLeft < 0 ? `Dobby: your ${input.taxYear} tax deadline passed` : `Dobby: ${input.daysLeft <= 1 ? "final call" : `${input.daysLeft} days left`} — ${input.taxYear} tax deadline`,
    text: lines.join("\n"),
  };
}

/**
 * Daily job: email trial/active users as their filing deadline approaches
 * (30/14/7/1-day marks) plus a one-time overdue notice. ReminderLog's unique
 * key dedupes, so re-runs and restarts never double-send.
 */
export async function runFilingDeadlineReminders(now = new Date()) {
  if (!mailConfigured()) return { sent: 0, skipped: "RESEND_NOT_CONFIGURED" as const };
  const profiles = await prisma.taxProfile.findMany({
    where: { owner: { plan: { in: [Plan.TRIAL, Plan.ACTIVE] } } },
    include: { owner: true, checklistItems: true },
  });
  let sent = 0;
  let skipped = 0;
  for (const profile of profiles) {
    try {
      if (!profile.owner.email) {
        skipped += 1;
        continue;
      }
      if (computeEffectivePlan(profile.owner) === "EXPIRED") {
        skipped += 1;
        continue;
      }
      const deadline = filingDeadlineFor(profile.country, profile.taxYear);
      const daysLeft = daysBeforeDeadline(deadline, now);
      const mark = markForDeadline(deadline, now);
      if (mark === null) {
        skipped += 1;
        continue;
      }
      const already = await prisma.reminderLog.findUnique({
        where: {
          ownerClerkId_kind_taxYear_daysBefore: {
            ownerClerkId: profile.ownerClerkId,
            kind: "filing-deadline",
            taxYear: profile.taxYear,
            daysBefore: mark,
          },
        },
        select: { id: true },
      });
      if (already) {
        skipped += 1;
        continue;
      }
      const outstanding = profile.checklistItems.filter((item) => item.country === profile.country && item.status === "OUTSTANDING").map((item) => item.label);
      const email = deadlineEmail({
        country: profile.country,
        taxYear: profile.taxYear,
        deadline,
        daysLeft,
        estimatedTaxOwed: profile.estimatedTaxOwed.toString(),
        outstanding,
      });
      const ok = await sendEmail(profile.owner.email, email.subject, email.text);
      if (!ok) {
        skipped += 1;
        continue;
      }
      await prisma.reminderLog.create({
        data: { ownerClerkId: profile.ownerClerkId, kind: "filing-deadline", taxYear: profile.taxYear, daysBefore: mark },
      });
      sent += 1;
    } catch (error) {
      logger.warn(
        { ownerClerkId: profile.ownerClerkId, error: error instanceof Error ? error.message : String(error) },
        "filing deadline reminder failed for one user",
      );
      skipped += 1;
    }
  }
  return { sent, skipped };
}
