/**
 * Deterministic narration patterns.
 *
 * These run after the user's saved rules and before the model, and they exist so
 * that the rows a bank states plainly never cost an LLM call — "Mobile Data |"
 * is not a judgement call, and asking a model about it is both slower and less
 * reliable than matching it.
 *
 * Kept in config rather than in the prompt for the same reason the provider
 * transfer patterns are: an auditable table beats a model that may or may not
 * apply the same rule on Tuesday.
 *
 * Patterns are matched against a normalised narration: lower-cased with
 * whitespace collapsed. A literal `|` never appears in a pattern, because
 * statements put a space before the delimiter (`"Mobile Data | ..."`) and a
 * literal would silently miss every real row.
 */

export interface DeterministicPattern {
  /** Stable id, for logging and for the user to override a rule later. */
  id: string;
  /** Substring to look for, already in the normalised form. */
  match: string;
  /** Category name from DEFAULT_CATEGORIES. */
  category: string;
  /** Restrict to one direction; null matches either. */
  type?: "INCOME" | "EXPENSE" | null;
}

const normalise = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

export const DETERMINISTIC_PATTERNS: DeterministicPattern[] = [
  { id: "mobile-data", match: "mobile data", category: "Phone & Data", type: "EXPENSE" },
  { id: "airtime", match: "airtime", category: "Phone & Data", type: "EXPENSE" },
  { id: "data-bundle", match: "data bundle", category: "Phone & Data", type: "EXPENSE" },
  { id: "ussd-charge", match: "ussd charge", category: "Bank charges", type: "EXPENSE" },
  { id: "atm-withdrawal", match: "atm withdrawal", category: "Cash withdrawal", type: "EXPENSE" },
  { id: "pos-transfer", match: "pos transfer", category: "Cash withdrawal", type: "EXPENSE" },
  { id: "interest-earned", match: "interest earned", category: "Interest income", type: "INCOME" },
];

export interface DeterministicMatch {
  patternId: string;
  category: string;
}

/**
 * First matching pattern for a narration and direction, or null.
 *
 * A pattern scoped to one direction is skipped when the row flows the other
 * way, which is what stops an expense keyword from being applied to money
 * coming in.
 */
export function matchDeterministic(
  narration: string,
  type: string,
): DeterministicMatch | null {
  const text = normalise(narration);
  if (!text) return null;
  for (const pattern of DETERMINISTIC_PATTERNS) {
    if (pattern.type && pattern.type !== type) continue;
    if (!text.includes(pattern.match)) continue;
    return { patternId: pattern.id, category: pattern.category };
  }
  return null;
}

/**
 * A loan is suggested, never applied. The narration says "loan" but only the
 * user knows whether it was received or repaid, and which of the two decides
 * whether it is income at all — so this returns a suggestion for the one-tap
 * prompt rather than a category.
 */
export function suggestLoan(description: string): boolean {
  return /\b(loan|borrow(ing|ed)?|advance)\b/i.test(description);
}