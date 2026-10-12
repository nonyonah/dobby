/**
 * The nudge engine.
 *
 * Holds every rule that is true of all nudges, so the config file stays a list
 * of definitions:
 *
 *   - when an email may go out at all (the local send window, and days the daily
 *     jobs have already claimed);
 *   - how often one person may hear from us (the 3-day cooldown and the
 *     2-per-week cap);
 *   - which nudge wins when several are due (priority, one per run);
 *   - and the stop conditions, which are just `due()` returning false.
 *
 * Every decision is written to `NudgeLog` before the send is attempted, so a
 * crash mid-run cannot produce a second copy on the next sweep.
 */

import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { appUrl } from "../emails/links.js";
import { sendNudgeEmail } from "../emails/templates/nudge.js";
import { LIVE_SUBSCRIPTION_STATUSES, entitlementSelect, getEntitlement, type EntitlementRow } from "../lib/entitlement.js";
import { NUDGE_RULES } from "./config.js";
import { taxCountryForJurisdiction } from "../tax/registry.js";
import { getTaxRules } from "../tax/registry.js";
import {
  EMAIL_COOLDOWN_DAYS,
  EMAIL_PER_WEEK,
  RESERVED_EMAIL_DAYS,
  SEND_WINDOW,
  type NudgeChannel,
  type NudgeContext,
  type NudgeFacts,
  type NudgeRule,
} from "./config.js";

/** Analytics event names, recorded even though the app has no server sink yet. */
export const NUDGE_EVENTS = {
  sent: "nudge_sent",
  clicked: "nudge_clicked",
  completed: "nudge_completed",
  dismissed: "nudge_dismissed",
} as const;

function hoursSince(value: Date | null | undefined, now: Date): number | null {
  if (!value) return null;
  return (now.getTime() - value.getTime()) / 3_600_000;
}

/** Local hour in the user's zone, without pulling in a date library. */
export function localHour(now: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone });
    return Number(formatter.format(now)) % 24;
  } catch {
    // An unknown zone falls back to UTC rather than dropping the email.
    return now.getUTCHours();
  }
}

/** Local day of month, for "the 2nd of the month". */
export function localDayOfMonth(now: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: timezone });
    return Number(formatter.format(now));
  } catch {
    return now.getUTCDate();
  }
}

/**
 * Whether it is a reasonable hour to email this person at all.
 *
 * Local time, because the alternative is deciding for them. The daily jobs
 * firing is *not* considered here — they run on UTC, and a user's local date is
 * not their business. That is `reservedToday`, which is a different question and
 * needs the database.
 */
export function emailWindowOpen(now: Date, timezone: string): boolean {
  const hour = localHour(now, timezone);
  return hour >= SEND_WINDOW.startHour && hour < SEND_WINDOW.endHour;
}

/**
 * Whether another job has already said something more important today.
 *
 * Two sources: the fixed daily slots (the filing-deadline reminder at 09:00 UTC,
 * and the monthly tax digest on the 1st), and the first-import summary, which
 * can land at any minute and is the one most likely to collide — it is the email
 * someone actually opened.
 */
export async function reservedToday(clerkId: string, now: Date): Promise<boolean> {
  const utcHour = now.getUTCHours();
  const utcDay = now.getUTCDate();

  // The filing-deadline job's slot. Suppressed for the hour it runs, which is
  // when the two would actually be minutes apart.
  if (utcHour === RESERVED_EMAIL_DAYS.filingDeadline.hourUtc) return true;
  // The tax digest goes out once on the 1st and is the most important email we
  // send; nothing competes with it that day.
  if (utcDay === RESERVED_EMAIL_DAYS.monthlyTax.day) return true;

  const startOfUtcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), utcDay));
  const summary = await prisma.user.findUnique({
    where: { clerkId },
    select: { firstImportSummarySentAt: true },
  });
  return (summary?.firstImportSummarySentAt ?? null) !== null && summary!.firstImportSummarySentAt! >= startOfUtcDay;
}

export type NudgeRunResult = {
  evaluated: number;
  sent: number;
  skippedWindow: number;
  skippedCaps: number;
  errors: number;
};

/** The user columns a nudge context is built from — engine and route read the same. */
export type NudgeUserRow = {
  clerkId: string;
  email: string | null;
  firstName: string | null;
  timezone: string | null;
  createdAt: Date;
  lastActiveAt: Date | null;
} & EntitlementRow;

/**
 * Builds the context every rule is evaluated against.
 *
 * Shared deliberately: the in-app card and the email sweep must agree on what is
 * true about a person, or the dashboard can show a nudge the engine would never
 * have sent and vice versa. One builder, one answer.
 */
export async function buildContext(user: NudgeUserRow, factCache: Map<string, NudgeFacts>, now: Date): Promise<NudgeContext> {
  const entitlement = getEntitlement(user, now);

  // One-time access is `planExpiresAt`, and only counts while there is no live
  // subscription — otherwise a customer who subscribes after buying a term
  // would be reminded to renew something the subscription already replaced.
  const hasLiveSubscription = LIVE_SUBSCRIPTION_STATUSES.has(user.bachsSubscriptionStatus ?? "");
  const oneTimeEndsAt = hasLiveSubscription ? null : user.planExpiresAt;
  const oneTimeDaysLeft = oneTimeEndsAt
    ? Math.ceil((oneTimeEndsAt.getTime() - now.getTime()) / 86_400_000)
    : null;

  const facts = await factsFor(user.clerkId, factCache, now);

  return {
    clerkId: user.clerkId,
    email: user.email ?? "",
    firstName: user.firstName,
    now,
    ageDays: (now.getTime() - user.createdAt.getTime()) / 86_400_000,
    inactiveHours: hoursSince(user.lastActiveAt, now),
    isPro: entitlement.isPro,
    status: entitlement.status,
    trialDaysLeft: entitlement.trialDaysLeft,
    oneTimeDaysLeft,
    hasLiveSubscription,
    facts: { ...facts, oneTimeJustExpired: oneTimeDaysLeft !== null && oneTimeDaysLeft >= -1 && oneTimeDaysLeft < 0 },
  };
}

/** The first due rule in priority order, or null. `channel` narrows to one surface. */
export function chooseRule(rules: NudgeRule[], context: NudgeContext, channel?: NudgeChannel): NudgeRule | null {
  for (const rule of rules) {
    // A rule that does not run on this surface is not a candidate here at all:
    // an email-only rule must never appear as an on-screen card.
    if (channel && !rule.channels.includes(channel)) continue;
    try {
      if (rule.due(context)) return rule;
    } catch {
      // A rule that throws is a rule that does not fire. Never let it take the
      // run down with it, and never let it win by accident.
      continue;
    }
  }
  return null;
}

export async function runNudges(now = new Date()): Promise<NudgeRunResult> {
  const users = await prisma.user.findMany({
    where: { email: { not: null } },
    select: {
      clerkId: true,
      email: true,
      firstName: true,
      timezone: true,
      createdAt: true,
      lastActiveAt: true,
      nudgeEmailsEnabled: true,
      nudgeInAppEnabled: true,
      ...entitlementSelect,
    },
    take: 1000,
  });

  const result: NudgeRunResult = { evaluated: 0, sent: 0, skippedWindow: 0, skippedCaps: 0, errors: 0 };
  const factCache = new Map<string, NudgeFacts>();
  const dueRules = [...NUDGE_RULES].sort((left, right) => left.priority - right.priority);

  for (const user of users) {
    const timezone = user.timezone ?? "Africa/Lagos";
    // In-app needs no send window and no email caps; an on-screen card costs
    // nothing to send and is useful at any hour.
    if (!user.nudgeInAppEnabled && !user.nudgeEmailsEnabled) continue;

    const context = await buildContext(user, factCache, now);

    result.evaluated += dueRules.length;
    const chosen = chooseRule(dueRules, context);
    if (!chosen) continue;

    // One nudge per person per run: the first due rule in priority order wins,
    // even when the one below it is also due.
    for (const channel of chosen.channels) {
      if (channel === "email" && !user.nudgeEmailsEnabled) continue;
      if (channel === "in_app" && !user.nudgeInAppEnabled) continue;

      const already = await prisma.nudgeLog.count({ where: { ownerClerkId: user.clerkId, nudgeKey: chosen.key } });
      if (already >= chosen.maxSends) continue;

      const lastSent = await prisma.nudgeLog.findFirst({
        where: { ownerClerkId: user.clerkId, nudgeKey: chosen.key },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true },
      });
      if (lastSent && (now.getTime() - lastSent.sentAt.getTime()) / 86_400_000 < chosen.cooldownDays) continue;

      if (channel === "email") {
        if (!(await emailBudgetAvailable(user.clerkId, now))) {
          result.skippedCaps += 1;
          continue;
        }
        if (!emailWindowOpen(now, timezone) || (await reservedToday(user.clerkId, now))) {
          result.skippedWindow += 1;
          continue;
        }
      }

      // Claim before sending. A crash after the send but before the log would
      // duplicate; a crash before the send would swallow. Claiming first is the
      // lesser evil, and the un-claim below handles the second case.
      const log = await prisma.nudgeLog.create({
        data: { ownerClerkId: user.clerkId, nudgeKey: chosen.key, channel, sentAt: now, shownAt: channel === "in_app" ? now : null },
        select: { id: true },
      });

      try {
        if (channel === "email") {
          const copy = chosen.copy(context);
          await sendNudgeEmail({
            to: user.email!,
            firstName: user.firstName,
            subject: copy.subject,
            headline: copy.headline,
            body: copy.body,
            ctaLabel: copy.ctaLabel,
            ctaHref: appUrl(copy.ctaPath),
            preferencesHref: appUrl("/settings#notifications"),
          });
        }
        logger.info({ nudge: chosen.key, channel, event: NUDGE_EVENTS.sent, clerkId: user.clerkId }, "nudge recorded");
        result.sent += 1;
      } catch (error) {
        // The send did not land, so the row must not stand: otherwise the
        // cooldown would treat a failed attempt as a delivery and suppress the
        // real send for days.
        await prisma.nudgeLog.delete({ where: { id: log.id } }).catch(() => undefined);
        result.errors += 1;
        logger.error({ nudge: chosen.key, channel, clerkId: user.clerkId, err: error }, "nudge send failed; claim released");
      }
    }
  }

  logger.info(result, "nudge run complete");
  return result;
}

/** The 3-day cooldown and 2-per-week cap, counted across every nudge. */
async function emailBudgetAvailable(clerkId: string, now: Date): Promise<boolean> {
  const recent = await prisma.nudgeLog.findMany({
    where: { ownerClerkId: clerkId, channel: "email", sentAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } },
    select: { sentAt: true },
  });
  const withinCooldown = recent.filter((row) => (now.getTime() - row.sentAt.getTime()) / 86_400_000 < EMAIL_COOLDOWN_DAYS);
  if (withinCooldown.length > 0) return false;
  const withinWeek = recent.filter((row) => (now.getTime() - row.sentAt.getTime()) / 7 * 86_400_000 <= EMAIL_PER_WEEK * 7).length;
  return withinWeek < EMAIL_PER_WEEK;
}

/** Live facts a rule may ask about. One pass per user per run. */
export async function factsFor(clerkId: string, cache: Map<string, NudgeFacts>, now: Date): Promise<NudgeFacts> {
  const cached = cache.get(clerkId);
  if (cached) return cached;

  const [setupComplete, importSpan, email, wallet, review, totals, uncategorized, overridden, rules, profile, taxProfile] =
    await Promise.all([
      prisma.user.findUnique({ where: { clerkId }, select: { onboardedAt: true } }),
      prisma.transactionImport.aggregate({
        where: { ownerClerkId: clerkId },
        _min: { createdAt: true },
        _max: { createdAt: true },
      }),
      prisma.integrationConnection.count({ where: { ownerClerkId: clerkId, status: "connected" } }),
      prisma.walletAccount.count({ where: { ownerClerkId: clerkId } }),
      prisma.transactionReviewItem.aggregate({
        where: { ownerClerkId: clerkId, status: "PENDING" },
        _count: { _all: true },
        _min: { createdAt: true },
      }),
      prisma.transaction.aggregate({ where: { ownerClerkId: clerkId }, _count: { _all: true } }),
      // "Uncategorized" is the review queue, not a blank category: a row with no
      // category at all would be counted here and the user could do nothing about it.
      prisma.transaction.count({ where: { ownerClerkId: clerkId, needsReview: true } }),
      // The user having corrected Dobby is the signal that they disagree with it,
      // which is what turns a rules prompt into a useful one.
      prisma.transaction.count({ where: { ownerClerkId: clerkId, userOverridden: true } }),
      prisma.categorizationRule.count({ where: { ownerClerkId: clerkId } }),
      prisma.profile.findUnique({ where: { clerkId }, select: { taxJurisdiction: true } }),
      // A tax row is the only durable trace that someone has actually been
      // inside the tax section — there is no page-view event to read.
      prisma.taxProfile.findUnique({ where: { ownerClerkId: clerkId }, select: { taxYear: true } }),
    ]);

  const taxModuleAvailable = profile?.taxJurisdiction
    ? Boolean(getTaxRules(taxCountryForJurisdiction(profile.taxJurisdiction))?.calculate)
    : false;

  const daysSince = (value: Date | null) => (value ? (now.getTime() - value.getTime()) / 86_400_000 : null);

  const facts: NudgeFacts = {
    setupComplete: Boolean(setupComplete?.onboardedAt),
    hasImport: importSpan._min.createdAt !== null,
    hasEmailConnection: email > 0,
    hasWallet: wallet > 0,
    reviewPendingCount: review._count._all,
    reviewOldestDays: review._min.createdAt ? Math.floor(daysSince(review._min.createdAt)!) : null,
    transactionsTotal: totals._count._all,
    uncategorizedCount: uncategorized,
    manuallyRecategorisedCount: overridden,
    hasRules: rules > 0,
    daysSinceFirstImport: daysSince(importSpan._min.createdAt),
    daysSinceLastImport: daysSince(importSpan._max.createdAt),
    taxModuleAvailable,
    importedTransactions: totals._count._all,
    openedTaxSection: taxProfile !== null,
    // Replaced by the real value in `buildContext`, which is the only place that
    // knows about the one-time end date. Present here as false so this function
    // cannot be read as the answer to "has it just expired".
    oneTimeJustExpired: false,
  };
  cache.set(clerkId, facts);
  return facts;
}