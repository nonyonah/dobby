import * as Sentry from "@sentry/nextjs";

/**
 * Browser-side error reporting.
 *
 * The browser knows things the API does not: the route the user was on, what
 * they had typed, which component threw. Some of that is personal finance data.
 * So the same posture as the API applies here — collect the minimum, and scrub
 * what is left before it leaves the browser.
 *
 * With no `NEXT_PUBLIC_SENTRY_DSN` set this is inert, so local development and
 * any environment that has not opted in behaves exactly as before.
 */

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

/** Wallet addresses and long opaque strings are identifying regardless of key. */
const ADDRESS_LIKE = /\b(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})\b/g;

/** Dropped only on exact match — these words hide inside harmless keys. */
const DENY_EXACT = new Set([
  "name", "email", "amount", "balance", "price", "total", "net", "income",
  "expenses", "note", "notes", "memo", "description", "merchant", "address",
  "account", "category", "currency", "wallet", "value", "label", "query",
  "search", "payload", "body", "formdata",
]);

/** Distinctive fragments, matched anywhere in the key. */
const DENY_SUBSTRING = [
  "authorization", "cookie", "password", "token", "secret", "apikey",
  "credential", "clerk", "session", "email", "firstname", "lastname", "phone",
];

const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");

const isDeniedKey = (key: string) => {
  const normalized = normalizeKey(key);
  return DENY_EXACT.has(normalized) || DENY_SUBSTRING.some((fragment) => normalized.includes(fragment));
};

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.replace(ADDRESS_LIKE, "[redacted]").slice(0, 512);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => scrub(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (isDeniedKey(key)) continue;
      out[key] = scrub(entry, depth + 1);
    }
    return out;
  }
  return undefined;
}

/** Query strings routinely carry search terms and ids; keep only the path. */
function scrubUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
    // Sentry v11 does not attach identity unless asked, so there is no PII
    // switch to flip here — beforeSend below is the backstop regardless.
    tracesSampleRate: 0,
    // Static lifecycle so beforeSendTransaction is honored ('stream' would
    // silently ignore it).
    traceLifecycle: "static",
    // Route changes are useful; the parameters on them are not.
    beforeSend(event) {
      const next = scrub(event) as typeof event;
      if (next.request?.url) next.request.url = scrubUrl(next.request.url);
      if (next.transaction) next.transaction = next.transaction.split("?")[0];
      return next;
    },
    beforeSendTransaction(event) {
      return scrub(event) as typeof event;
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;