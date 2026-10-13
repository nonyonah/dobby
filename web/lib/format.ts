/**
 * Locale per currency, so amounts are grouped the way that currency writes them.
 * Anything missing falls back to en-US, which is right for most but not all —
 * CAD and ZAR were formatting with US grouping and decimal marks.
 */
const CURRENCY_LOCALES: Record<string, string> = {
  USD: "en-US",
  NGN: "en-NG",
  GBP: "en-GB",
  GHS: "en-GH",
  KES: "en-KE",
  CAD: "en-CA",
  ZAR: "en-ZA",
};

export const CURRENCY_STORAGE_KEY = "dobby-currency";

/**
 * The display currency saved on this device, or `null` when nothing is stored.
 *
 * `null` is deliberately distinct from a value: callers that seed the preference
 * from the account need to tell "never chosen here" apart from "chosen NGN", or
 * they would overwrite a real choice with a first-run default on every visit.
 */
export function readStoredCurrency(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CURRENCY_STORAGE_KEY)?.toUpperCase() || null;
  } catch {
    return null;
  }
}

/** Persists the display currency for this device. */
export function writeStoredCurrency(currency: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CURRENCY_STORAGE_KEY, currency.toUpperCase());
  } catch {
    /* private mode: the account copy still has it */
  }
}

/** Announced whenever the display currency changes, including cross-tab. */
export const CURRENCY_EVENT = "dobby-currency-change";

/**
 * Applies the display currency: persists it and tells mounted views to re-read.
 *
 * Theme and Accent have always applied the moment they are picked, because
 * waiting for Save left those controls looking broken while the app carried on
 * rendering the old colours. Currency went the other way and only took effect on
 * save, so the three preferences behaved differently for no reason. Every one of
 * them now applies on change and commits to the account on Save.
 */
export function setAppCurrency(currency: string) {
  if (typeof window === "undefined") return;
  writeStoredCurrency(currency);
  window.dispatchEvent(new CustomEvent(CURRENCY_EVENT, { detail: currency.toUpperCase() }));
}

export function getAppCurrency(): string {
  return readStoredCurrency() ?? "NGN";
}

/**
 * Formats a figure that is ALREADY in the app's currency.
 *
 * The name used to be `formatUSD`, which is the whole problem: it reads as
 * "format these dollars", and it does not convert a thing. It takes the app
 * currency preference and prints the number with that currency's symbol and
 * locale, so a genuine dollar figure handed to it comes out wearing the wrong
 * unit — $707 rendered as ₦707. That shipped three times on the wallet page
 * before the name changed, each time looking correct in review because the
 * number was right.
 *
 * If the value is in dollars, convert it first with the API and use
 * `formatCurrency(amount, currency)`, or use `convertUsd` on the wallet page.
 * This function is only for values the API already converted.
 */
export function formatAppCurrency(n: number): string {
  const currency = getAppCurrency();
  return new Intl.NumberFormat(CURRENCY_LOCALES[currency] ?? "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Formats an amount in an explicit currency.
 *
 * This is the one to reach for when the figure is not already in the app's
 * currency — a value the API converted, or one converted here.
 * `formatAppCurrency` assumes the number is right and only picks the symbol.
 */
export function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALES[currency] ?? "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
