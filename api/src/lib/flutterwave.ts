import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "./logger.js";
import { AppError } from "../middleware/errors.js";

const BASE_URL = "https://api.flutterwave.com/v3";

/**
 * NGN one-time prices for Dobby Pro. Monthly ≈ annual/12 rounded, so the
 * yearly term keeps the same ~17% discount as the USD pairing ($5/mo, $50/yr).
 */
export const FLUTTERWAVE_PRICES = {
  month: { amount: 3500, currency: "NGN", days: 30 },
  year: { amount: 35000, currency: "NGN", days: 365 },
} as const;

export type FlutterwaveInterval = keyof typeof FLUTTERWAVE_PRICES;

export function flutterwaveConfigured(): boolean {
  return Boolean(env.FLUTTERWAVE_SECRET_KEY);
}

async function flwFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  if (!env.FLUTTERWAVE_SECRET_KEY) {
    throw new AppError(503, "Flutterwave payments are not configured.", "FLUTTERWAVE_NOT_CONFIGURED");
  }
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => null)) as { status?: string; message?: string; data?: unknown } | null;
  if (!response.ok || !payload || payload.status !== "success") {
    const message = payload?.message ?? `Flutterwave request failed with status ${response.status}.`;
    throw new AppError(502, message, "FLUTTERWAVE_REQUEST_FAILED");
  }
  return payload.data;
}

export function newTxRef(clerkId: string): string {
  const digest = createHash("sha256").update(`${clerkId}:${Date.now()}:${randomUUID()}`).digest("hex").slice(0, 12);
  return `dobby-${Date.now().toString(36)}-${digest}`;
}

/** Create a hosted Standard payment; the user completes it on Flutterwave's page. */
export async function createFlutterwavePayment(input: {
  interval: FlutterwaveInterval;
  email: string;
  name?: string;
  txRef: string;
  redirectUrl: string;
}): Promise<{ link: string; txRef: string }> {
  const price = FLUTTERWAVE_PRICES[input.interval];
  const data = (await flwFetch("/payments", {
    method: "POST",
    body: JSON.stringify({
      tx_ref: input.txRef,
      amount: price.amount,
      currency: price.currency,
      redirect_url: input.redirectUrl,
      payment_options: "card, banktransfer, ussd, account",
      customer: { email: input.email, ...(input.name ? { name: input.name } : {}) },
      customizations: { title: "Dobby Pro" },
      meta: { interval: input.interval, app: "dobby" },
    }),
  })) as { link?: string };
  if (!data?.link) throw new AppError(502, "Flutterwave did not return a payment link.", "FLUTTERWAVE_REQUEST_FAILED");
  return { link: data.link, txRef: input.txRef };
}

export type VerifiedFlutterwaveTransaction = {
  id: number;
  txRef: string;
  amount: number;
  currency: string;
  status: string;
  customerEmail?: string;
};

/** Server-side truth: fetch the transaction and return its core fields. */
export async function verifyFlutterwaveTransaction(id: number | string): Promise<VerifiedFlutterwaveTransaction> {
  const data = (await flwFetch(`/transactions/${id}/verify`)) as {
    id?: number;
    tx_ref?: string;
    amount?: number;
    currency?: string;
    status?: string;
    customer?: { email?: string };
  };
  if (typeof data?.id !== "number" || typeof data?.tx_ref !== "string") {
    throw new AppError(502, "Flutterwave returned an unrecognised transaction.", "FLUTTERWAVE_REQUEST_FAILED");
  }
  return {
    id: data.id,
    txRef: data.tx_ref,
    amount: Number(data.amount ?? 0),
    currency: String(data.currency ?? "").toUpperCase(),
    status: String(data.status ?? ""),
    customerEmail: data.customer?.email,
  };
}

/**
 * Webhook authenticity: Flutterwave sends the secret hash (set on the webhook
 * endpoint) as the `verif-hash` header. Fail closed — no hash configured or
 * no match means reject.
 */
export function flutterwaveWebhookValid(signature: string | undefined): boolean {
  const expected = env.FLUTTERWAVE_SECRET_HASH;
  if (!expected || !signature) {
    if (!expected) logger.warn("flutterwave webhook received with no FLUTTERWAVE_SECRET_HASH configured");
    return false;
  }
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
