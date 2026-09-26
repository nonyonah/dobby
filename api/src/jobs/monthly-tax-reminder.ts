import { Plan } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { mailConfigured, sendEmail } from "../lib/mailer.js";
import { getTaxRules } from "../tax/registry.js";
import { generateGatewaySummary } from "../providers/ai-gateway.js";
import { computeEffectivePlan } from "../middleware/plan.js";

export async function runMonthlyTaxReminder(now = new Date()) {
  if (!mailConfigured()) return { sent: 0, skipped: "RESEND_NOT_CONFIGURED" as const };
  // Monthly email reminders are a paid feature: active subscribers and anyone
  // still inside the free trial get them; lapsed trials are filtered out below.
  const profiles = await prisma.taxProfile.findMany({
    where: { owner: { plan: { in: [Plan.TRIAL, Plan.ACTIVE] } } },
    include: { owner: true, checklistItems: true },
  });
  let sent = 0;
  for (const profile of profiles) {
    if (!profile.owner.email) continue;
    if (computeEffectivePlan(profile.owner) === "EXPIRED") continue;
    // One digest per profile per calendar month — a crash mid-loop never resends.
    const monthMark = now.getMonth() + 1;
    const already = await prisma.reminderLog.findUnique({
      where: {
        ownerClerkId_kind_taxYear_daysBefore: {
          ownerClerkId: profile.ownerClerkId,
          kind: "monthly-tax",
          taxYear: profile.taxYear,
          daysBefore: monthMark,
        },
      },
      select: { id: true },
    });
    if (already) continue;
    const rules = getTaxRules(profile.country);
    const outstanding = profile.checklistItems.filter((item) => item.status === "OUTSTANDING");
    const facts = [`Country: ${rules.country}`, `Tax year: ${profile.taxYear}`, `Estimated tax owed: ${profile.estimatedTaxOwed.toString()}`, `Outstanding documents: ${outstanding.length}`, ...outstanding.map((item) => `- ${item.label}`)].join("\n");
    let summary = facts;
    try {
      summary = await generateGatewaySummary(`Create a concise monthly tax reminder email summary using only these facts:\n${facts}\nAsk the user to confirm their documents are ready. State that the estimate is informational only.`);
    } catch (error) {
      summary = `${facts}\nPlease confirm your records with a qualified tax professional.`;
    }
    const delivered = await sendEmail(profile.owner.email, `Dobby tax reminder \u2014 ${profile.taxYear}`, `${summary}\n\nPlease confirm your records with a qualified tax professional.`);
    if (!delivered) continue;
    await prisma.reminderLog.create({
      data: { ownerClerkId: profile.ownerClerkId, kind: "monthly-tax", taxYear: profile.taxYear, daysBefore: monthMark },
    }).catch(() => undefined);
    sent += 1;
  }
  return { sent };
}
