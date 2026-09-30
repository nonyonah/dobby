import type { TaxCountry } from "@prisma/client";
import { canadaRules } from "./canada.js";
import { kenyaRules } from "./kenya.js";
import { nigeriaRules } from "./nigeria.js";
import { southAfricaRules } from "./south-africa.js";
import { ukRules } from "./uk.js";
import { usRules } from "./us.js";
import type { TaxRuleModule } from "./types.js";

const modules: Record<TaxCountry, TaxRuleModule> = {
  NIGERIA: nigeriaRules,
  US: usRules,
  UK: ukRules,
  CANADA: canadaRules,
  KENYA: kenyaRules,
  SOUTH_AFRICA: southAfricaRules,
};

export function getTaxRules(country?: TaxCountry | null) {
  return modules[country ?? "NIGERIA"] ?? modules.NIGERIA;
}

/**
 * Profile slugs live in the web app's country list and are what `Profile` stores,
 * so this mapping is the one place that turns a user-facing choice into the
 * jurisdiction the module registry keys on. Anything unrecognised falls back to
 * Nigeria, which is the behaviour that shipped before tax jurisdictions were
 * expanded and therefore the safe default for existing profiles.
 */
const SLUG_TO_COUNTRY: Record<string, TaxCountry> = {
  nigeria: "NIGERIA",
  "united-states": "US",
  us: "US",
  "united-kingdom": "UK",
  uk: "UK",
  canada: "CANADA",
  kenya: "KENYA",
  "south-africa": "SOUTH_AFRICA",
};

export function taxCountryForJurisdiction(slug: string | null | undefined): TaxCountry {
  return SLUG_TO_COUNTRY[(slug ?? "").toLowerCase()] ?? "NIGERIA";
}

export { SLUG_TO_COUNTRY };
