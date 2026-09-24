import { Resend } from "resend";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { getTaxRules } from "../tax/registry.js";
import { generateGatewaySummary } from "../providers/ai-gateway.js";

export async function runMonthlyTaxReminder(now = new Date()) {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) return { sent: 0, skipped: "RESEND_NOT_CONFIGURED" as const };
  const resend = new Resend(env.RESEND_API_KEY);
  const profiles = await prisma.taxProfile.findMany({ include: { owner: true, checklistItems: true } });
  let sent = 0;
  for (const profile of profiles) {
    if (!profile.owner.email) continue;
    const rules = getTaxRules(profile.country);
    const outstanding = profile.checklistItems.filter((item) => item.status === "OUTSTANDING");
    const facts = [`Country: ${rules.country}`, `Tax year: ${profile.taxYear}`, `Estimated tax owed: ${profile.estimatedTaxOwed.toString()}`, `Outstanding documents: ${outstanding.length}`, ...outstanding.map((item) => `- ${item.label}`)].join("\\n");
    let summary = facts;
    try {
      summary = await generateGatewaySummary(`Create a concise monthly tax reminder email summary using only these facts:\n${facts}\nAsk the user to confirm their documents are ready. State that the estimate is informational only.`);
    } catch (error) {
      summary = `${facts}\\nPlease confirm your records with a qualified tax professional.`;
    }
    await resend.emails.send({ from: env.RESEND_FROM_EMAIL, to: profile.owner.email, subject: `Dobby tax reminder — ${profile.taxYear}`, text: `${summary}\\n\\nPlease confirm your records with a qualified tax professional.` });
    sent += 1;
  }
  return { sent };
}
