import { generateText } from "ai";
import { env } from "../config/env.js";
import { AppError } from "../middleware/errors.js";

export async function generateGatewaySummary(prompt: string) {
  if (!env.AI_GATEWAY_API_KEY) throw new AppError(503, "AI Gateway is not configured.", "AI_GATEWAY_NOT_CONFIGURED");
  const result = await generateText({
    model: env.AI_GATEWAY_MODEL,
    system: "You are Dobby, a careful personal finance assistant. Be concise, factual, and clear. Do not provide legal, tax, or investment advice. Tax figures are informational estimates only.",
    prompt,
  });
  return result.text.trim();
}
