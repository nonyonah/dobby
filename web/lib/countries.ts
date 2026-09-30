/**
 * Two deliberately separate lists.
 *
 * BILLING_COUNTRIES is what we can take money in from. TAX_JURISDICTIONS is
 * whose tax rules we can estimate. These used to be one list, which quietly
 * meant adding a tax jurisdiction also implied we could bill there. Keep them
 * apart: adding Kenya to tax is not a decision to accept Kenyan cards.
 *
 * Labels are display-ready: they lead with the flag emoji and use proper
 * capitalisation, because they are rendered directly as native `<option>`
 * text (the OS picker has no styling hook of its own). Anything user-facing
 * that needs a country or currency name should read it from here rather than
 * re-typing the string, so flags never go missing in one surface only.
 */

export type CurrencyCode = "NGN" | "USD" | "GBP" | "CAD" | "KES" | "ZAR";

export interface TaxJurisdiction {
  /** Stable key stored on the profile as `Profile.taxJurisdiction`. */
  value: string;
  label: string;
  name: string;
  flag: string;
  currency: CurrencyCode;
  /** Shown under the estimate so a partial calculation cannot read as complete. */
  scope?: string;
}

export interface Country {
  value: string;
  label: string;
  name: string;
  flag: string;
  /** Two-letter code sent to the billing API. */
  iso: string;
  currency: CurrencyCode;
}

/** Countries we bill. Adding a tax jurisdiction must not add an entry here. */
export const BILLING_COUNTRIES: Country[] = [
  { value: "nigeria", label: "🇳🇬 Nigeria", name: "Nigeria", flag: "🇳🇬", iso: "NG", currency: "NGN" },
  { value: "united-states", label: "🇺🇸 United States", name: "United States", flag: "🇺🇸", iso: "US", currency: "USD" },
];

/**
 * Countries whose tax we estimate.
 *
 * There is deliberately no "European Union" entry. Personal income tax is not
 * harmonised at EU level — each of the 27 member states sets its own rates,
 * allowances and filing calendar — so an "EU" jurisdiction could only ever be
 * an invented average labelled with a flag. Canada is federal-only and says so,
 * because provincial tax is a separate stack of rate tables.
 */
export const TAX_JURISDICTIONS: TaxJurisdiction[] = [
  { value: "nigeria", label: "🇳🇬 Nigeria", name: "Nigeria", flag: "🇳🇬", currency: "NGN" },
  { value: "united-states", label: "🇺🇸 United States", name: "United States", flag: "🇺🇸", currency: "USD" },
  { value: "united-kingdom", label: "🇬🇧 United Kingdom", name: "United Kingdom", flag: "🇬🇧", currency: "GBP" },
  { value: "kenya", label: "🇰🇪 Kenya", name: "Kenya", flag: "🇰🇪", currency: "KES" },
  { value: "south-africa", label: "🇿🇦 South Africa", name: "South Africa", flag: "🇿🇦", currency: "ZAR" },
  { value: "canada", label: "🇨🇦 Canada", name: "Canada", flag: "🇨🇦", currency: "CAD", scope: "Federal tax only — provincial and territorial tax is not included." },
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
  { value: "gbp", label: "🇬🇧 GBP — Pound Sterling", code: "GBP", name: "Pound Sterling", flag: "🇬🇧" },
  { value: "cad", label: "🇨🇦 CAD — Canadian Dollar", code: "CAD", name: "Canadian Dollar", flag: "🇨🇦" },
  { value: "kes", label: "🇰🇪 KES — Kenyan Shilling", code: "KES", name: "Kenyan Shilling", flag: "🇰🇪" },
  { value: "zar", label: "🇿🇦 ZAR — South African Rand", code: "ZAR", name: "South African Rand", flag: "🇿🇦" },
];

export const COUNTRY_OPTIONS = BILLING_COUNTRIES.map(({ value, label }) => ({ value, label }));
export const CURRENCY_OPTIONS = CURRENCIES.map(({ value, label }) => ({ value, label }));
export const TAX_JURISDICTION_OPTIONS = TAX_JURISDICTIONS.map(({ value, label }) => ({ value, label }));

export const THEME_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** Resolves a stored billing country, defaulting to Nigeria. */
export function toCountry(value: string | null | undefined): (typeof BILLING_COUNTRIES)[number] {
  const key = (value ?? "").toLowerCase();
  const match = BILLING_COUNTRIES.find((country) => country.value === key)
    ?? BILLING_COUNTRIES.find((country) => country.name.toLowerCase() === key);
  return match ?? BILLING_COUNTRIES[0];
}

/** Resolves a stored tax jurisdiction, defaulting to Nigeria. */
export function toTaxJurisdiction(value: string | null | undefined): TaxJurisdiction {
  const key = (value ?? "").toLowerCase();
  return TAX_JURISDICTIONS.find((jurisdiction) => jurisdiction.value === key) ?? TAX_JURISDICTIONS[0];
}
