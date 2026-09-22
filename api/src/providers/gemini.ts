import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { AppError } from "../middleware/errors.js";

export async function extractReceipt(data: { mimeType: string; bytes: string }) {
  if (!env.GEMINI_API_KEY) throw new AppError(503, "Gemini is not configured.", "GEMINI_NOT_CONFIGURED");
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: [{ inlineData: { mimeType: data.mimeType, data: data.bytes } }, { text: "Extract receipt merchant, total amount, currency, transaction date, and line-item description. Return only JSON with merchant, amount, currency, occurredAt, description." }] });
  return response.text ?? "{}";
}
