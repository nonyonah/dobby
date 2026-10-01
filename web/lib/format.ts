const CURRENCY_LOCALES: Record<string, string> = {
  USD: "en-US",
  NGN: "en-NG",
  GBP: "en-GB",
  GHS: "en-GH",
  KES: "en-KE",
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

export function getAppCurrency(): string {
  return readStoredCurrency() ?? "NGN";
}

export function formatUSD(n: number): string {
  const currency = getAppCurrency();
  return new Intl.NumberFormat(CURRENCY_LOCALES[currency] ?? "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Formats an amount in an explicit currency (unlike formatUSD, which reads the app preference). */
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
