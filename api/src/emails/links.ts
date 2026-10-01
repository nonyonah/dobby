/** Where the CTA links go, so the app's host is defined in exactly one place. */
export function appUrl(path: string): string {
  const base = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
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
};
