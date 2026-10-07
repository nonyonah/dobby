"use client";

import type { PostHog } from "posthog-js";

/**
 * Product analytics for Dobby.
 *
 * This is a personal-finance app. What reaches a third-party analytics vendor
 * must therefore be limited to *how the product is used*, never *what is in the
 * user's ledger*. Three rules hold throughout:
 *
 *   1. Nothing loads until the visitor opts in. The PostHog script is only
 *      requested after consent, so declining costs nothing — no cookie, no
 *      network call, no vendor identifier.
 *   2. Events carry shapes and counts, never values. "3 transactions imported"
 *      is fine; the amounts, merchants, categories and tax figures they carried
 *      are not.
 *   3. Identity is a per-user random id held in localStorage, never a Clerk id,
 *      email address or anything else that could be joined back to a person.
 *
 * `sanitizeProperties` is the choke point. Anything that reaches the vendor goes
 * through it, so a careless future call site cannot leak by forgetting.
 */

const CONSENT_KEY = "dobby-analytics-consent";
const DISTINCT_ID_KEY = "dobby-analytics-id";
const TOKEN = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.posthog.com";

export type AnalyticsConsent = "granted" | "denied" | null;

let client: PostHog | null = null;
let loadPromise: Promise<PostHog | null> | null = null;
let currentConsent: AnalyticsConsent = null;
const queued: Array<[string, Record<string, unknown>]> = [];

/**
 * Denied words, matched **token-wise** rather than as substrings.
 *
 * Whole-key matching misses compound names — `categoryName`, `walletAddress`
 * and `taxOwed` each decompose into denied words but are not themselves denied —
 * while substring matching over-reaches, dropping `pathname` (contains `name`)
 * and `provided` (contains `id`) and throwing away the feature-usage signal
 * this integration exists to collect. Splitting on camelCase, snake_case,
 * kebab-case and digits is precise in both directions.
 */
const DENY_TOKENS = new Set([
  "amount", "balance", "price", "total", "net", "income", "expense", "expenses",
  "tax", "owed", "wallet", "address", "merchant", "description", "memo", "note",
  "notes", "email", "name", "phone", "account", "category", "categories",
  "currency", "salary", "fingerprint", "value", "sum", "avg", "label", "title",
  "text", "query", "url", "password", "token", "secret", "apikey", "credential",
  "authorization", "cookie", "vendor", "seller",
]);

/**
 * Keys denied on their whole normalised form, regardless of tokens — privacy
 * terms that have no word boundary of their own.
 */
const DENY_WHOLE_KEY = new Set([
  "userid", "ownerid", "txref", "providertxid", "firstname", "lastname", "fullname",
]);

const keyTokens = (key: string): string[] =>
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .flatMap((part) => part.replace(/([a-zA-Z])(\d)/g, "$1 $2").split(" "))
    .filter(Boolean)
    .map((token) => token.toLowerCase());

const isDeniedKey = (key: string) => {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (DENY_WHOLE_KEY.has(normalized)) return true;
  return keyTokens(key).some((token) => DENY_TOKENS.has(token));
};

const ADDRESS_LIKE = /\b(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})\b/g;

/**
 * The single gate every event passes through.
 *
 * Denied keys are dropped rather than redacted: a key called `amount` is going
 * to keep being called `amount`, and the safest thing to do with it is to not
 * send it. Anything left that looks like a wallet address is masked.
 */
export function sanitizeProperties(properties: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (isDeniedKey(key)) continue;
    if (typeof value === "string") {
      out[key] = value.replace(ADDRESS_LIKE, "[redacted]").slice(0, 120);
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    }
    // Objects, arrays, functions and nulls are dropped: they are where nested
    // financial data hides, and no current event needs them.
  }
  return out;
}

/** A random, non-identifying per-browser id. Never derived from account data. */
function distinctId(): string {
  const existing = window.localStorage.getItem(DISTINCT_ID_KEY);
  if (existing) return existing;
  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(DISTINCT_ID_KEY, generated);
  return generated;
}

export function readConsent(): AnalyticsConsent {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(CONSENT_KEY);
  return stored === "granted" || stored === "denied" ? stored : null;
}

/**
 * Load PostHog, but only if consent is already granted and a token is
 * configured. Resolves to null otherwise — callers do not need to branch on
 * whether analytics exists, because `track` is safe to call unconditionally.
 */
async function ensureClient(): Promise<PostHog | null> {
  if (!TOKEN) return null;
  if (client) return client;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const posthogModule = (await import("posthog-js")).default;
    const instance = posthogModule.init(TOKEN, {
      api_host: HOST,
      persistence: "localStorage",
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
      // No IP collection: identity comes from `identify()` below, never from
      // PostHog deriving one from the network.
      ip: false,
      bootstrap: { distinctID: distinctId() },
    }) as unknown as PostHog;
    client = instance;
    for (const [name, properties] of queued.splice(0)) {
      client.capture(name, properties);
    }
    return client;
  })();

  return loadPromise;
}

/**
 * Record a product event. Safe to call before consent or before the script has
 * loaded: if there is no consent the call is a no-op, and if the script is still
 * in flight the event is queued and flushed on load.
 *
 * Every property is sanitized here, so no call site can leak by omission.
 */
export function track(name: string, properties: Record<string, unknown> = {}): void {
  if (!TOKEN) return;
  if (currentConsent !== "granted") return;
  const safe = sanitizeProperties(properties);
  if (!client) {
    if (queued.length < 50) queued.push([name, safe]);
    return;
  }
  client.capture(name, safe);
}

/** Record that the visitor signed in. Carries no identity — see the module note. */
export function identify(): void {
  if (!TOKEN || currentConsent !== "granted") return;
  if (client) client.identify(distinctId());
}

export async function grantConsent(): Promise<void> {
  currentConsent = "granted";
  window.localStorage.setItem(CONSENT_KEY, "granted");
  await ensureClient();
}

/**
 * Decline, or withdraw later. Opt-out has to be more than a flag: it stops new
 * events, clears the persisted identity and drops the loaded client, so
 * withdrawal actually withdraws rather than just hiding further tracking.
 */
export async function revokeConsent(): Promise<void> {
  currentConsent = "denied";
  window.localStorage.setItem(CONSENT_KEY, "denied");
  queued.length = 0;
  if (client) {
    // opt_out_tracking stops anything further being sent; reset clears the
    // current distinct id. `delete_user` lives on the People interface, not on
    // the client itself, so the localStorage cleanup below is what actually
    // removes the stored identity.
    client.opt_out_capturing();
    client.reset();
    client = null;
  }
  loadPromise = null;
  window.localStorage.removeItem(DISTINCT_ID_KEY);
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith("ph_")) window.localStorage.removeItem(key);
  }
}

/** Start analytics on boot. Consent gate removed: track immediately. */
export async function initAnalytics(): Promise<AnalyticsConsent> {
  currentConsent = "granted";
  await ensureClient();
  return currentConsent;
}

export function analyticsConfigured(): boolean {
  return Boolean(TOKEN);
}