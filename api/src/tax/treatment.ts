import type { TransactionType } from "@prisma/client";
import type { TaxCountry } from "@prisma/client";

/**
 * Tax treatment is derived, never guessed.
 *
 * The model never asked for a taxable flag — it classifies purpose, and purpose
 * is what tax treatment follows from. A row that lands in "Interest income" is
 * taxable by statute; a row that lands in "Loan received" is a liability, not
 * earnings. Where the law turns on facts the statement does not carry (an
 * unexplained inflow), the honest answer is "ask" rather than a coin flip.
 *
 * Nigeria Tax Act 2025 (in force January 2026) is the reference: personal
 * remittances, gifts, family support and loans are not taxable income, while
 * employment, business and investment receipts are.
 */

export type TaxTreatment = "taxable" | "not_taxable" | "ask";

/** Every category that resolves without asking, keyed by lower-cased name. */
const TREATMENT: Record<TaxCountry, Record<string, TaxTreatment>> = {
  NIGERIA: {
    "work payment": "taxable",
    salary: "taxable",
    "business sales": "taxable",
    "interest income": "taxable",
    // NRS Guidelines on Taxation of Virtual Assets (31 July 2026): yield on a
    // stablecoin is investment income under Category 4. Only the yield — the
    // principal that earned it is never income.
    "yield / investment income": "taxable",
    // A conversion of the user's own asset, so not income. A disposal gain would
    // be a capital matter, but a pegged stablecoin's gain is approximately zero
    // and capital gains are not modelled in this pass.
    "stablecoin cash-out": "not_taxable",
    "stablecoin purchase": "not_taxable",
    "gift / family support": "not_taxable",
    "loan received": "not_taxable",
    refund: "not_taxable",
    "own account transfer": "not_taxable",
  },
  // Yield is income on receipt in the US (ordinary income once dominion and
  // control is obtained), Canada (CRA treats a crypto receipt as barter income
  // at receipt), Kenya (income from virtual assets is taxable when received)
  // and South Africa (SARS taxes a crypto receipt at receipt, not on disposal).
  US: { "yield / investment income": "taxable", "interest income": "taxable", "stablecoin cash-out": "not_taxable", "stablecoin purchase": "not_taxable" },
  CANADA: { "yield / investment income": "taxable", "interest income": "taxable", "stablecoin cash-out": "not_taxable", "stablecoin purchase": "not_taxable" },
  KENYA: { "yield / investment income": "taxable", "interest income": "taxable", "stablecoin cash-out": "not_taxable", "stablecoin purchase": "not_taxable" },
  SOUTH_AFRICA: { "yield / investment income": "taxable", "interest income": "taxable", "stablecoin cash-out": "not_taxable", "stablecoin purchase": "not_taxable" },
  /**
   * The one jurisdiction here that treats yield differently, and the reason this
   * table is per-country rather than global.
   *
   * HMRC treats staking rewards that come with dominion and control — the
   * "additional tokens" case — as part of the cost of acquiring the asset, not
   * as income. Tax arises on disposal instead. So the same receipt that is
   * taxable on receipt in the US, Canada, Kenya and South Africa is not income
   * here. A user's own ruling can differ, which is why it is a category the
   * user can move.
   */
  UK: {
    "yield / investment income": "not_taxable",
    // Bank interest is taxable on receipt everywhere, including here. Adding it
    // is what stopped an ordinary savings row being sent back to the user as a
    // question while stablecoin yield, a far more contested point, resolved
    // itself.
    "interest income": "taxable",
    "stablecoin cash-out": "not_taxable",
    "stablecoin purchase": "not_taxable",
  },
};

/**
 * Categories that are unambiguously spend. Their rows carry no taxable value at
 * all, so they never reach `ask` — an expense is not a tax question.
 */
const EXPENSE_CATEGORIES = new Set([
  "phone & data",
  "transport",
  "food & groceries",
  "rent & housing",
  "utilities",
  "subscriptions",
  "donations / church",
  "bank charges",
  "cash withdrawal",
  "health",
  "education",
  "shopping",
  "other",
]);

/** Own-account movement. Never income, never spend, never taxable. */
export const OWN_ACCOUNT_TRANSFER_CATEGORY = "Own account transfer";
export const UNCATEGORIZED_CATEGORY = "Uncategorized";

export interface TreatmentResult {
  treatment: TaxTreatment;
  /** Why — surfaced in the UI so "ask" reads as a question, not an error. */
  reason: string;
}

/**
 * What tax treatment, if any, this row carries.
 *
 * `treatment` is `null` for EXPENSE and TRANSFER rows: the column stays null
 * rather than being set to `false`, because "not deductible" and "not a
 * deductible kind of row" are different statements and only one of them is true.
 */
export function taxTreatment(
  country: TaxCountry,
  type: TransactionType,
  categoryName: string | null | undefined,
): TreatmentResult | null {
  if (type === "EXPENSE") return null;
  if (type === "TRANSFER") return null;

  const name = (categoryName ?? "").trim();
  if (!name || name.toLowerCase() === UNCATEGORIZED_CATEGORY.toLowerCase()) {
    return { treatment: "ask", reason: "This inflow has not been categorised, so its tax treatment is unknown." };
  }

  const key = name.toLowerCase();
  const table = TREATMENT[country] ?? {};

  const known = table[key];
  if (known) {
    return {
      treatment: known,
      reason: known === "taxable" ? `${name} is taxable income.` : `${name} is not taxable income.`,
    };
  }

  if (EXPENSE_CATEGORIES.has(key)) {
    // An expense-shaped category on an inflow is a mis-categorisation, not a
    // tax question — but it still is not something to decide silently.
    return { treatment: "ask", reason: `${name} is normally a spending category, but this row is money coming in.` };
  }

  return { treatment: "ask", reason: `No tax rule covers ${name} yet.` };
}

/**
 * The one-tap prompt shown in To Review for inflows the rules could not place.
 * Deliberately short and phrased as a question, because the alternative is a
 * number the user has no way to check.
 */
export const ASK_CHOICES = [
  { category: "Work payment", taxable: true },
  { category: "Gift / family support", taxable: false },
  { category: "Loan received", taxable: false },
  { category: "Own account transfer", taxable: false },
  { category: "Other", taxable: null },
] as const;