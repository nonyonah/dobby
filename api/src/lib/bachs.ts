import crypto from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../middleware/errors.js";
import { logger } from "./logger.js";

const SANDBOX_BASE_URL = "https://sandbox-api.bachs.io";
const LIVE_BASE_URL = "https://api.bachs.io";

/** `sk_live_…` keys talk to production; everything else (including `sk_sandbox_…`) talks to sandbox. */
const baseUrl = () => (env.BACHS_API_KEY?.startsWith("sk_live_") ? LIVE_BASE_URL : SANDBOX_BASE_URL);

/** Billing switches off cleanly when the Bachs key or the Pro product id is missing. */
export function billingConfigured(): boolean {
  return Boolean(env.BACHS_API_KEY && env.BACHS_PRO_PRODUCT_ID);
}

function requireConfigured(): void {
  if (!billingConfigured()) {
    throw new AppError(503, "Billing is not configured for this environment.", "BILLING_NOT_CONFIGURED");
  }
}

async function bachsFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  requireConfigured();
  const hasBody = typeof init.body === "string" && init.body.length > 0;
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.BACHS_API_KEY}`,
      ...(hasBody ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });

  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    // Bachs answers with a flat `{ detail, error_code }`; older shapes nest the
    // message under `error`. Prefer the human-readable text either way.
    const error = payload as
      | { detail?: string; message?: string; error_code?: string; error?: { message?: string; error_code?: string } }
      | undefined;
    const message = error?.detail ?? error?.error?.message ?? error?.message ?? error?.error?.error_code ?? error?.error_code;
    logger.warn({ path, status: response.status, message }, "bachs request failed");
    throw new AppError(response.status === 400 ? 400 : 502, message ?? "Bachs could not complete the request.", "BACHS_UPSTREAM_ERROR");
  }

  return payload as T;
}

export type CheckoutSession = { checkout_id: string; checkout_url: string };

/** The two cadences Dobby Pro is sold on. */
export type BillingInterval = "month" | "year";

const productIdFor = (interval: BillingInterval) =>
  interval === "year" ? env.BACHS_PRO_YEARLY_PRODUCT_ID : env.BACHS_PRO_PRODUCT_ID;

/**
 * Starts the hosted checkout that turns a Pro product into a subscription.
 * The customer picks nothing on our side: `interval` decides which catalog
 * product (monthly or yearly) the Bachs page bills. No return URL is sent —
 * the checkout opens as an overlay on our own page, which reports completion
 * in-browser while the webhook confirms it, so nothing depends on a public
 * address. `metadata.clerk_user_id` is copied onto the subscription when
 * checkout succeeds, which is how a webhook event finds the user it belongs to.
 */
export async function createProCheckout(input: {
  email: string;
  name?: string;
  clerkUserId: string;
  interval: BillingInterval;
}): Promise<CheckoutSession> {
  const productId = productIdFor(input.interval);
  if (!productId) {
    throw new AppError(503, "Billing is not configured for this environment.", "BILLING_NOT_CONFIGURED");
  }

  return bachsFetch<CheckoutSession>("/v1/checkout-sessions", {
    method: "POST",
    body: JSON.stringify({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: input.name ? { email: input.email, name: input.name } : { email: input.email },
      metadata: { clerk_user_id: input.clerkUserId },
    }),
  });
}

/** Mints a short-lived URL that opens the hosted portal for an existing customer. */
export async function createPortalSession(customerId: string): Promise<{ id: string; url: string }> {
  return bachsFetch(`/v1/customers/${customerId}/portal-sessions`, { method: "POST", body: "{}" });
}

export type SubscriptionState = {
  status?: string;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
};

/**
 * Stops the subscription from renewing. `cancel_at_period_end` keeps Pro
 * running (and the card un-charged at the renewal) until the period already
 * paid for runs out — Bachs emits `customer.subscription.deleted` at that
 * point, which is what finally downgrades the account.
 */
export async function cancelProSubscription(subscriptionId: string): Promise<SubscriptionState> {
  return bachsFetch(`/v1/subscriptions/${subscriptionId}`, {
    method: "DELETE",
    body: JSON.stringify({ cancel_at_period_end: true, reason: "user_requested" }),
  });
}

const hmac = (secret: string, message: string) => crypto.createHmac("sha256", secret).update(message, "utf8").digest("hex");

function equalHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/**
 * Verifies `X-Bachs-Signature-V2` (`t={timestamp},v1={digest}`), falling back to
 * the v1 pair of `X-Bachs-Timestamp` + `X-Bachs-Signature`. Both sign
 * `"{timestamp}.{rawBody}"` with HMAC-SHA256; a delivery outside the tolerance
 * window is rejected so a replayed event cannot be reused later.
 */
export function verifyBachsSignature(input: {
  rawBody: Buffer;
  secret?: string;
  signatureV2?: string;
  signature?: string;
  timestamp?: string;
}): boolean {
  const secret = input.secret ?? env.BACHS_WEBHOOK_SECRET;
  if (!secret) return false;

  const toleranceSeconds = 300;
  let eventTimestamp: number | undefined;
  const candidates: string[] = [];

  if (input.signatureV2) {
    const parts = input.signatureV2.split(",").map((part) => part.trim());
    const timestampPart = parts.find((part) => part.startsWith("t="));
    eventTimestamp = Number(timestampPart?.slice(2));
    candidates.push(...parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3)));
  } else if (input.signature && input.timestamp) {
    eventTimestamp = Number(input.timestamp);
    candidates.push(input.signature);
  }

  if (!Number.isFinite(eventTimestamp) || Math.abs(Date.now() / 1000 - eventTimestamp!) > toleranceSeconds) return false;

  const expected = hmac(secret, `${eventTimestamp}.${input.rawBody.toString("utf8")}`);
  return candidates.some((candidate) => equalHex(expected, candidate));
}
