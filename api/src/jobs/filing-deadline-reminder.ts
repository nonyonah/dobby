import { Plan } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { mailConfigured, sendDeadlineNotification } from "../lib/mailer.js";
import { getTaxRules } from "../tax/registry.js";
import { logger } from "../lib/logger.js";
import { computeEffectivePlan } from "../middleware/plan.js";
import { jurisdictionLabel } from "./monthly-tax-reminder.js";

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

/**
 * Subject and display facts for the deadline email.
 *
 * Returns facts, not markup: the job stays plain TypeScript and the template
 * owns the rendering. Urgency is not decided here either — the template derives
 * tone, weight and wording from `daysLeft`, so the 30-day notice and the
 * overdue one cannot drift apart as two separately-maintained sets of copy. The
 * outstanding documents are counted, not listed: an email is the wrong place for
 * a list the user has to work through in the checklist anyway.
 */
export function deadlineEmail(input: {
  country: string;
  taxYear: number;
  deadline: string;
  daysLeft: number;
  estimatedTaxOwed: string;
  outstanding: string[];
}): { subject: string; deadlineLabel: string; jurisdiction: string } {
  const deadlineLabel = new Date(`${input.deadline}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const jurisdiction = jurisdictionLabel(input.country);
  const subject =
    input.daysLeft < 0
      ? `Dobby: your ${jurisdiction} tax deadline has passed`
      : input.daysLeft <= 7
        ? `Dobby: ${jurisdiction} tax is due ${input.daysLeft === 0 ? "today" : `in ${input.daysLeft} days`}`
        : `Dobby: ${jurisdiction} filing deadline ${deadlineLabel}`;
  return { subject, deadlineLabel, jurisdiction };
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
  const candidates: Array<{ profile: (typeof profiles)[number]; mark: number; daysLeft: number; deadline: string }> = [];
  for (const profile of profiles) {
    if (!profile.owner.email || computeEffectivePlan(profile.owner) === "EXPIRED") {
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
    candidates.push({ profile, mark, daysLeft, deadline });
  }

  if (candidates.length > 0) {
    const alreadySent = await prisma.reminderLog.findMany({
      where: {
        kind: "filing-deadline",
        OR: candidates.map(({ profile, mark }) => ({
          ownerClerkId: profile.ownerClerkId,
          taxYear: profile.taxYear,
          daysBefore: mark,
        })),
      },
      select: { ownerClerkId: true, taxYear: true, daysBefore: true },
    });
    const sentKeys = new Set(alreadySent.map((row) => `${row.ownerClerkId}:${row.taxYear}:${row.daysBefore}`));

    for (const { profile, mark, daysLeft, deadline } of candidates) {
      try {
        if (sentKeys.has(`${profile.ownerClerkId}:${profile.taxYear}:${mark}`)) {
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
        const ok = await sendDeadlineNotification({
          to: profile.owner.email!,
          firstName: profile.owner.firstName,
          deadlineLabel: email.deadlineLabel,
          daysRemaining: daysLeft,
          jurisdictionLabel: email.jurisdiction,
          estimatedTaxOwed: Number(profile.estimatedTaxOwed ?? 0),
          currency: getTaxRules(profile.country as never).currency,
          checklistReady: 0,
          checklistTotal: outstanding.length,
          subject: email.subject,
        });
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
  }
  return { sent, skipped };
}
