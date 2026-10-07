import * as Sentry from "@sentry/node";
import { env, isProduction } from "../config/env.js";

/**
 * Error monitoring for a personal-finance API.
 *
 * Dobby handles the most sensitive category of data there is: someone's bank
 * statements, tax estimates and wallet addresses. An error report is the easiest
 * place for that to leak, because stack traces and request context capture
 * whatever happened to be in scope. So this module is written defensively —
 * nothing leaves the process that has not been through `scrub`, and the default
 * posture is to send less rather than more.
 *
 * Rules, in order of preference:
 *   1. Do not collect it (sendDefaultPii off, no request bodies, no headers).
 *   2. Drop the whole field if we cannot be certain what is in it.
 *   3. Only then, keep a coarse, non-reversible hint (a hashed user id).
 */

/**
 * Keys dropped only on an exact match. These words are short and appear inside
 * harmless diagnostic keys — `pathname` contains `name`, `metadata` contains
 * `data` — so matching them as substrings would throw away exactly the routing
 * and shape context an error report exists to carry.
 */
const DENY_EXACT = new Set([
  "amount", "balance", "price", "total", "net", "income", "expenses",
  "estimatedtaxowed", "taxableincome", "targetamount",
  "name", "note", "notes", "memo", "content", "rawbody",
  "description", "merchant", "fingerprint", "externalid",
  "address", "phone", "signature", "txref", "providertxid",
]);

/**
 * Distinctive fragments matched anywhere in the key. These have no innocent
 * lookalike in this codebase, so substring matching is safe and catches the
 * prefixed spellings (`userEmail`, `x-api-key`, `stripeSecretKey`) that an exact
 * list would always miss.
 */
const DENY_SUBSTRING = [
  "authorization", "cookie", "password", "passwd", "token", "secret", "apikey",
  "credential", "privatekey", "signature", "txref", "databaseurl", "directurl",
  "email", "firstname", "lastname", "fullname", "username",
];

/** Anonymise a Clerk id so incidents can be correlated per-user but not identified. */
export function hashUserId(userId: string | null | undefined): string | undefined {
  if (!userId) return undefined;
  // FNV-1a: short, dependency-free, and only ever applied to ids that are
  // already opaque. It obscures an identifier in a report; it is not a
  // substitute for real access control, and nothing security-relevant keys off it.
  let hash = 0x811c9dc5;
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `u_${hash.toString(16).padStart(8, "0")}`;
}

const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");

const isDeniedKey = (key: string) => {
  const normalized = normalizeKey(key);
  return DENY_EXACT.has(normalized) || DENY_SUBSTRING.some((fragment) => normalized.includes(fragment));
};

/**
 * Wallet addresses and long opaque strings are identifying even when the key
 * looks harmless, so anything address-shaped is replaced outright.
 */
const ADDRESS_LIKE = /\b(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})\b/g;

const scrubString = (value: string) => value.replace(ADDRESS_LIKE, "[redacted-address]");

/** Recursively drop denied keys and redact address-shaped values. */
export function scrub<T>(value: T, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return scrubString(value).slice(0, 512);
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

export function initSentry(): void {
  if (!env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    // Sentry v11 no longer takes `sendDefaultPii` on the Node SDK: personal data is
    // not collected unless asked for. `includeLocalVariables` is the one switch
    // that would attach live locals to stack frames, so it stays off, and
    // beforeSend is the backstop for whatever the integrations do attach.
    includeLocalVariables: false,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    // Keep the classic static transaction lifecycle so beforeSendTransaction
    // below is honored (it is a no-op under the default 'stream' lifecycle).
    traceLifecycle: "static",
    // Scrubbing runs last so it covers breadcrumb and scope data too, not just
    // the exception the handler happened to pass.
    beforeSend(event) {
      const scrubbed = scrub(event) as typeof event;
      return scrubbed;
    },
    beforeSendTransaction(event) {
      return scrub(event) as typeof event;
    },
  });
}

export { Sentry };