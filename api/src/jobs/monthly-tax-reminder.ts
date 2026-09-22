import { Resend } from "resend";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { getTaxRules } from "../tax/registry.js";

export async function runMonthlyTaxReminder(now = new Date()) {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) return { sent: 0, skipped: "RESEND_NOT_CONFIGURED" as const };
  const resend = new Resend(env.RESEND_API_KEY);
  const profiles = await prisma.taxProfile.findMany({ include: { owner: true, checklistItems: true } });
  let sent = 0;
  for (const profile of profiles) {
    if (!profile.owner.email) continue;
    const rules = getTaxRules(profile.country);
    const outstanding = profile.checklistItems.filter((item) => item.status === "OUTSTANDING");
    await resend.emails.send({ from: env.RESEND_FROM_EMAIL, to: profile.owner.email, subject: `Dobby tax reminder — ${profile.taxYear}`, text: [`Your ${rules.country} informational tax estimate is ${profile.estimatedTaxOwed.toString()}.`, `Documents still marked outstanding: ${outstanding.length}.`, ...outstanding.map((item) => `- ${item.label}`), "Please confirm your records with a qualified tax professional."].join("\\n") });
    sent += 1;
  }
  return { sent };
}
