const CURRENCY_LOCALES: Record<string, string> = {
  USD: "en-US",
  NGN: "en-NG",
  GBP: "en-GB",
  GHS: "en-GH",
  KES: "en-KE",
};

export function getAppCurrency(): string {
  if (typeof window === "undefined") return "NGN";
  return window.localStorage.getItem("dobby-currency")?.toUpperCase() || "NGN";
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
