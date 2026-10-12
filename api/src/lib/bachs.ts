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
    // 4xx is Bachs telling us something definite — a subscription that no longer
    // exists is a 404, and the caller must be able to tell that apart from an
    // outage before deciding what to do with the row. Collapsing every non-400
    // into 502 erased that distinction.
    const status = response.status >= 400 && response.status < 500 ? response.status : 502;
    throw new AppError(status, message ?? "Bachs could not complete the request.", "BACHS_UPSTREAM_ERROR");
  }

  return payload as T;
}

export type CheckoutSession = {
  checkout_id: string;
  checkout_url: string;
  /** The corridors this session will actually offer, when Bachs reports them. */
  payment_methods?: string[];
};

/** The two cadences Dobby Pro is sold on. */
export type BillingInterval = "month" | "year";

/**
 * Display-only anchors for the price pills. The amount actually charged comes
 * from the Bachs catalog product behind each `BACHS_PRO_*_PRODUCT_ID`, so this
 * can drift from the real price — change the product and this in the same commit.
 */
export const SUBSCRIPTION_PRICE_ANCHORS = {
  month: "4.00",
  year: "36.00",
} as const;

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
      // No `payment_method_types`. Sending one is how this used to be pinned to
      // `["USD_CARD"]`, which meant a customer whose only working rail was a
      // bank transfer or a crypto asset reached a page with nothing they could
      // pay with. Omitting the field leaves Bachs to offer every corridor the
      // account actually has enabled, so the choice is the customer's and the
      // list stays correct when Bachs add or change one.
      //
      // Restriction only ever narrows — it cannot surface a corridor the account
      // is not enabled for — so there was nothing to gain by naming them.
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
  trial_end?: string | null;
};

/**
 * Stops the subscription from renewing. `cancel_at_period_end` keeps Pro
 * running (and the card un-charged at the renewal) until the period already
 * paid for runs out — Bachs emits `customer.subscription.deleted` at that
 * point, which is what finally downgrades the account.
 */
export async function cancelProSubscription(
  subscriptionId: string,
  options: { atPeriodEnd?: boolean } = {},
): Promise<SubscriptionState> {
  // Immediate is the default because that is what a Cancel button means.
  // `cancel_at_period_end: true` leaves the subscription billing normally in
  // Bachs until the period runs out, so the dashboard still shows it as active
  // and the user reasonably concludes the cancel did nothing.
  const atPeriodEnd = options.atPeriodEnd ?? false;
  return bachsFetch(`/v1/subscriptions/${subscriptionId}`, {
    method: "DELETE",
    body: JSON.stringify({ cancel_at_period_end: atPeriodEnd, reason: "user_requested" }),
  });
}

/**
 * Reads the live subscription back from Bachs.
 *
 * The webhook is the primary path, but it is a delivery, not a guarantee: a
 * missing webhook secret, a redeploy mid-flight, or an event for a
 * subscription we could not match at the time all leave the stored status
 * frozen. That is what strands a customer on a trial that has already become
 * a paid subscription — or, worse, on a $0.00 trial that never converts.
 *
 * So the row is reconciled against the source of truth on the way past.
 */
export async function retrieveSubscription(subscriptionId: string): Promise<SubscriptionState> {
  return bachsFetch(`/v1/subscriptions/${subscriptionId}`, { method: "GET" });
}

/**
 * The same read, but "Bachs has never heard of this subscription" is an answer
 * rather than a failure.
 *
 * That case is the one that strands a customer: a sandbox reset, a subscription
 * that ended and was reaped, or a row written from an event we matched
 * incorrectly. Either way the local row claims a live trial that no longer
 * exists, and without this the caller cannot tell that from Bachs being down.
 */
export async function retrieveSubscriptionOrNull(subscriptionId: string): Promise<SubscriptionState | null> {
  try {
    return await retrieveSubscription(subscriptionId);
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 404) return null;
    throw error;
  }
}

/**
 * Corridors offered on a one-time checkout.
 *
 * Bank transfer and crypto are the two that cannot back a subscription: Bachs
 * will only re-charge a card, because a later cycle is billed with the customer
 * absent. That is the whole reason there are two checkouts rather than one
 * checkout with everything on it.
 *
 * A corridor can be added here once the account has it enabled — `NGN_CARD` is
 * the obvious next one. Restriction only ever narrows what the customer sees; it
 * never adds a corridor the account cannot accept.
 */
export const ONE_TIME_PAYMENT_METHODS = ["NGN_BANK_TRANSFER", "CRYPTO"] as const;

export type OneTimePaymentMethod = (typeof ONE_TIME_PAYMENT_METHODS)[number];

/**
 * What one "Pay once" buys.
 *
 * A single month, at the same price as the monthly subscription, rather than a
 * ladder of prepaid terms. The point of this path is that someone who cannot
 * put a recurring card on a rail can still pay; how many months they buy up
 * front is a product decision that should be made deliberately, not smuggled in
 * as a discount table.
 */
export const ONE_TIME_MONTHS = 1;

/** How long a one-time checkout stays open. Long enough to pay, short enough to expire. */
export const ONE_TIME_EXPIRY_MINUTES = 60;

/**
 * Starts the hosted checkout for a single, non-recurring payment.
 *
 * Priced with `pricing` rather than `product_cart`: there is no catalog product
 * behind this, and Bachs treats the two as mutually exclusive. `currency: "USD"`
 * is what makes adaptive pricing do the work — the customer pays in their own
 * currency at the prevailing rate and Bachs credits us in USD.
 *
 * `reference` is unique per attempt and is echoed back on the webhook, so a
 * retry after a failure is a new reference rather than a second order silently
 * collapsing onto the first.
 */
export async function createOneTimeCheckout(input: {
  email: string;
  name?: string;
  clerkUserId: string;
  reference: string;
  successUrl: string;
  cancelUrl: string;
  currencyOptions?: Record<string, string>;
}): Promise<OneTimeCheckoutSession> {
  const amount = Number(SUBSCRIPTION_PRICE_ANCHORS.month).toFixed(2);

  return bachsFetch<OneTimeCheckoutSession>("/v1/checkout-sessions", {
    method: "POST",
    body: JSON.stringify({
      pricing: {
        currency: "USD",
        amount,
        // Optional exact amounts per currency. Omitted, Bachs converts at the
        // live rate — which is the default, because a hardcoded naira amount
        // goes stale against the rate and quietly overcharges.
        ...(input.currencyOptions && Object.keys(input.currencyOptions).length > 0
          ? { currency_options: input.currencyOptions }
          : {}),
      },
      customer: input.name ? { email: input.email, name: input.name } : { email: input.email },
      payment_method_types: [...ONE_TIME_PAYMENT_METHODS],
      expires_in_minutes: ONE_TIME_EXPIRY_MINUTES,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      reference: input.reference,
      metadata: {
        clerk_user_id: input.clerkUserId,
        purchase: "one_time",
        months: String(ONE_TIME_MONTHS),
      },
    }),
  });
}

export type OneTimeCheckoutSession = {
  checkout_id: string;
  checkout_url: string;
  status?: string;
  payment_status?: string;
  /** What the customer will actually see. Narrower than what we asked for. */
  payment_methods?: string[];
  amount?: string;
  currency?: string;
  reference?: string | null;
  metadata?: Record<string, unknown>;
  customer?: { id?: string | null; email?: string | null; name?: string | null };
  customer_details?: { email?: string; name?: string };
};

/**
 * Checks the corridors that actually came back on the session.
 *
 * Bachs will happily create a checkout showing only bank transfer on an account
 * that cannot do crypto yet, and the request still succeeds — a silent success
 * that costs a customer who arrives at the page expecting to pay in crypto.
 * Logged with the session id so a report of "crypto is missing" can be traced to
 * the exact checkout that dropped it.
 */
export function logMissingPaymentMethods(session: OneTimeCheckoutSession, log: typeof logger): void {
  const offered = session.payment_methods ?? [];
  const missing = ONE_TIME_PAYMENT_METHODS.filter((method) => !offered.includes(method));
  if (missing.length === 0) return;

  log.warn(
    {
      checkoutId: session.checkout_id,
      requested: [...ONE_TIME_PAYMENT_METHODS],
      offered,
      missing,
      hint: missing.length === offered.length || offered.length === 0
        ? "the account is probably not enabled for these corridors — check GET /v1/accounts/checkout/settings"
        : "the corridor is not enabled on the account, or adaptive pricing is off",
    },
    "one-time checkout does not offer every requested payment method",
  );
}

export type CheckoutSettings = {
  adaptive_pricing?: boolean;
  base_currency?: string;
  available_currencies?: Record<string, string[]>;
  /**
   * Keyed by corridor, not an array: `{ CRYPTO: { enabled: true, currencies: {…} } }`.
   *
   * Worth stating because it was an array in an earlier draft of this file, and
   * reading an object with `.filter()` throws at runtime rather than failing a
   * type check somewhere visible.
   */
  enabled_payment_methods?: Record<string, { enabled?: boolean; currencies?: Record<string, boolean> } | undefined>;
};

/**
 * Reads what the account can actually accept.
 *
 * `payment_method_types` is a request, not a promise: it narrows the checkout
 * and Bachs silently drops anything the account is not enabled for. This is the
 * only place that truth is visible before a customer hits the page.
 *
 * Returns null rather than throwing — a settings read that fails is a reason to
 * warn loudly, not a reason to refuse to sell.
 */
export async function readCheckoutSettings(): Promise<CheckoutSettings | null> {
  try {
    return await bachsFetch<CheckoutSettings>("/v1/accounts/checkout/settings", { method: "GET" });
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : String(error) }, "could not read bachs checkout settings");
    return null;
  }
}

/**
 * Reports whether a one-time checkout can actually offer what we ask for.
 *
 * Two distinct failures, deliberately told apart in the message:
 *   - adaptive pricing off means a USD-priced checkout can only be paid in the
 *     account's base currency, so naira and crypto corridors drop out silently;
 *   - a corridor simply not enabled on the account cannot be switched on from here.
 */
/**
 * What about this account would stop a one-time checkout offering a rail, as
 * plain sentences.
 *
 * Pure, so it can be tested against the shapes Bachs actually returns. The
 * object-keyed `enabled_payment_methods` is the thing worth testing: reading it
 * as an array throws inside the webhook-adjacent code path, where the visible
 * symptom is a 500 on checkout creation rather than a warning in a log.
 */
export function oneTimeCorridorWarnings(settings: CheckoutSettings): string[] {
  const warnings: string[] = [];

  if (settings.adaptive_pricing === false) {
    warnings.push(
      "adaptive pricing is OFF, so a USD-priced checkout can only be paid in the account's base currency and the naira and crypto corridors drop out — turn adaptive pricing on in the Bachs dashboard",
    );
  }

  const methods = settings.enabled_payment_methods ?? {};
  const enabled = new Set(
    Object.entries(methods)
      .filter(([, method]) => method?.enabled === true)
      .map(([code]) => code),
  );

  const missing = ONE_TIME_PAYMENT_METHODS.filter((method) => !enabled.has(method));
  if (missing.length > 0) {
    warnings.push(
      `these corridors are not enabled on the account: ${missing.join(", ")} — enable them in the Bachs dashboard or the customer only sees the rest`,
    );
  }

  // `CRYPTO` reads as enabled while offering nothing when every asset under it
  // is false, so it needs its own check or a crypto-only account looks configured.
  const assets = methods.CRYPTO?.currencies;
  if (enabled.has("CRYPTO") && assets !== undefined && Object.values(assets).every((value) => value !== true)) {
    warnings.push(`CRYPTO is enabled but all ${Object.keys(assets).length} assets under it are false, so crypto will not appear on any checkout`);
  }

  return warnings;
}

export async function warnIfOneTimeUnavailable(log: typeof logger): Promise<void> {
  const settings = await readCheckoutSettings();
  if (!settings) {
    log.warn("could not confirm bachs checkout settings; a one-time checkout may not offer bank transfer or crypto");
    return;
  }

  for (const warning of oneTimeCorridorWarnings(settings)) {
    log.warn({ adaptivePricing: settings.adaptive_pricing }, warning);
  }
}

/**
 * Reads a checkout back from Bachs.
 *
 * Used before granting anything for a one-time payment: the webhook says a
 * charge succeeded, but it does not say which plan it paid for or how much, and
 * a redirect the customer could have skipped is not evidence at all.
 */
export async function retrieveCheckout(checkoutId: string): Promise<OneTimeCheckoutSession> {
  return bachsFetch<OneTimeCheckoutSession>(`/v1/checkout-sessions/${encodeURIComponent(checkoutId)}`, { method: "GET" });
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
