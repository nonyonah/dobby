/**
 * Single source of truth for the two supported countries and their currencies.
 *
 * Labels are display-ready: they lead with the flag emoji and use proper
 * capitalisation, because they are rendered directly as native `<option>`
 * text (the OS picker has no styling hook of its own). Anything user-facing
 * that needs a country or currency name should read it from here rather than
 * re-typing the string, so flags never go missing in one surface only.
 */

export type CountryCode = "nigeria" | "united-states";
export type CurrencyCode = "NGN" | "USD";

export interface Country {
  /** Stable key stored on the profile. */
  value: CountryCode;
  /** Flag + properly capitalised name, e.g. "🇳🇬 Nigeria". */
  label: string;
  name: string;
  flag: string;
  /** Two-letter code sent to the billing API. */
  iso: string;
  /** Default display currency for users in this country. */
  currency: CurrencyCode;
  /** Default tax jurisdiction for users in this country. */
  jurisdiction: CountryCode;
}

export const COUNTRIES: Country[] = [
  {
    value: "nigeria",
    label: "🇳🇬 Nigeria",
    name: "Nigeria",
    flag: "🇳🇬",
    iso: "NG",
    currency: "NGN",
    jurisdiction: "nigeria",
  },
  {
    value: "united-states",
    label: "🇺🇸 United States",
    name: "United States",
    flag: "🇺🇸",
    iso: "US",
    currency: "USD",
    jurisdiction: "united-states",
  },
];

export interface Currency {
  value: string;
  /** Flag + code + spelled-out name, e.g. "🇳🇬 NGN — Nigerian Naira". */
  label: string;
  code: CurrencyCode;
  name: string;
  flag: string;
}

export const CURRENCIES: Currency[] = [
  { value: "ngn", label: "🇳🇬 NGN — Nigerian Naira", code: "NGN", name: "Nigerian Naira", flag: "🇳🇬" },
  { value: "usd", label: "🇺🇸 USD — US Dollar", code: "USD", name: "US Dollar", flag: "🇺🇸" },
];

export const COUNTRY_OPTIONS = COUNTRIES.map(({ value, label }) => ({ value, label }));
export const CURRENCY_OPTIONS = CURRENCIES.map(({ value, label }) => ({ value, label }));

export const THEME_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** Resolves a stored profile value to a country, defaulting to Nigeria. */
export function toCountry(value: string | null | undefined): Country {
  const key = (value ?? "").toLowerCase();
  if (key === "us" || key === "united-states" || key === "united states") return COUNTRIES[1];
  return COUNTRIES[0];
}
