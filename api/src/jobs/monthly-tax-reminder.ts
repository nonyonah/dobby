import { Plan } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { mailConfigured, sendMonthlyTaxNotification } from "../lib/mailer.js";
import { getTaxRules } from "../tax/registry.js";
import { computeEffectivePlan } from "../middleware/plan.js";

/**
 * Monthly tax reminder.
 *
 * Scheduling, plan gating and the once-per-month guard all stay here — they are
 * job concerns. Only the rendering moved into the template, so the email is
 * deterministic and looks like the product instead of being written fresh by a
 * model each month and landing in a different shape every time.
 */
export async function runMonthlyTaxReminder(now = new Date()) {
  if (!mailConfigured()) return { sent: 0, skipped: "RESEND_NOT_CONFIGURED" as const };
  // Monthly email reminders are a paid feature: active subscribers and anyone
  // still inside the free trial get them; lapsed trials are filtered out below.
  const profiles = await prisma.taxProfile.findMany({
    where: { owner: { plan: { in: [Plan.TRIAL, Plan.ACTIVE] } } },
    include: { owner: true, checklistItems: true },
  });
  const monthMark = now.getMonth() + 1;
  const candidates = profiles.filter((profile) => profile.owner.email && computeEffectivePlan(profile.owner) !== "EXPIRED");
  if (candidates.length === 0) return { sent: 0 };

  const alreadySent = await prisma.reminderLog.findMany({
    where: {
      kind: "monthly-tax",
      daysBefore: monthMark,
      ownerClerkId: { in: candidates.map((profile) => profile.ownerClerkId) },
      taxYear: { in: [...new Set(candidates.map((profile) => profile.taxYear))] },
    },
    select: { ownerClerkId: true, taxYear: true },
  });
  const sentKeys = new Set(alreadySent.map((row) => `${row.ownerClerkId}:${row.taxYear}`));

  let sent = 0;
  for (const profile of candidates) {
    if (sentKeys.has(`${profile.ownerClerkId}:${profile.taxYear}`)) continue;
    const rules = getTaxRules(profile.country);
    // Checklists are per jurisdiction; only the active country's items are this
    // user's outstanding work.
    const items = profile.checklistItems.filter((item) => item.country === profile.country);
    const ready = items.filter((item) => item.status === "READY").length;

    const delivered = await sendMonthlyTaxNotification({
      to: profile.owner.email!,
      firstName: profile.owner.firstName,
      estimatedTaxOwed: Number(profile.estimatedTaxOwed ?? 0),
      currency: rules.currency,
      checklistReady: ready,
      checklistTotal: items.length,
      jurisdictionLabel: jurisdictionLabel(profile.country),
      taxYear: profile.taxYear,
    });
    if (!delivered) continue;
    await prisma.reminderLog.create({
      data: { ownerClerkId: profile.ownerClerkId, kind: "monthly-tax", taxYear: profile.taxYear, daysBefore: monthMark },
    }).catch(() => undefined);
    sent += 1;
  }
  return { sent };
}

/**
 * Attributive jurisdiction label, matching the jurisdiction labels in the app.
 * Every template slot reads as a noun phrase ("your ${jurisdictionLabel} Revenue
 * Service"), so this must be an adjective or a bare country name — never a
 * country name dropped in front of a noun ("your Nigeria Revenue Service").
 */
export function jurisdictionLabel(country: string): string {
  switch (country) {
    case "US":
      return "US federal";
    case "UK":
      return "UK";
    case "KENYA":
      return "Kenyan";
    case "SOUTH_AFRICA":
      return "South African";
    case "CANADA":
      return "Canadian federal";
    default:
      return "Nigerian";
  }
}
