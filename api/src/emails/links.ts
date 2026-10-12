import { env } from "../config/env.js";

/**
 * Where the CTA links go, so the app's host is defined in exactly one place.
 *
 * Reads `env.WEB_ORIGIN` rather than `process.env.APP_URL`. That is the variable
 * the API already declares and the one every environment actually sets — it
 * drives CORS, so a host that is wrong here is visibly wrong there too. `APP_URL`
 * was never in the env schema, so on production it was always unset and every
 * link resolved to `http://localhost:3000`, which is how a checkout ended up
 * being created with a `success_url` Bachs refuses as not publicly accessible.
 *
 * `APP_URL` still wins where it is set, for the case where a deployment wants
 * the link host to differ from the browser-facing one.
 */
export function appUrl(path: string): string {
  const configured = process.env.APP_URL ?? env.WEB_ORIGIN;
  const base = (configured || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * The app URL for a redirect Bachs will actually follow.
 *
 * Bachs requires `success_url` and `cancel_url` to be publicly reachable, so a
 * checkout created with a localhost host is rejected by the provider rather than
 * by us. That failure arrives as an opaque upstream error at the worst possible
 * moment — the customer is mid-purchase — so it is worth refusing up front with
 * a message that names the variable to set.
 */
export function publicAppUrl(path: string): string {
  const url = appUrl(path);
  if (!url.startsWith("https://")) {
    throw new Error(
      `Bachs requires a public https APP_URL, but the API resolved links to "${url}". ` +
        `Set APP_URL (or WEB_ORIGIN) to the public https origin of the app.`,
    );
  }
  return url;
}

/**
 * Money in the email, formatted the way the app formats it.
 *
 * Deliberately not Intl: the API and the web app can disagree on ICU data across
 * Node versions, and an email that renders "CA$1,234.00" in one place and
 * "1.234,00 $CA" in another undermines the point of matching the product.
 */
export function formatMoney(amount: number, currency: string): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const decimals = currency === "JPY" || currency === "KRW" ? 0 : 2;
  const fixed = Math.abs(safe).toFixed(decimals);
  const [whole = "0", fraction] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()] ?? `${currency.toUpperCase()} `;
  const sign = safe < 0 ? "-" : "";
  return `${sign}${symbol}${grouped}${fraction ? `.${fraction}` : ""}`;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: "₦",
  USD: "$",
  CAD: "CA$",
  GBP: "£",
  EUR: "€",
  KES: "KSh ",
  ZAR: "R",
  GHS: "GH₵",
  JPY: "¥",
  KRW: "₩",
  // Currencies with no widely used symbol fall through to the code, which is
  // what a reader would recognise. `formatMoney` appends a space for these.
};
