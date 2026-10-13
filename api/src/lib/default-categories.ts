/**
 * Default categories seeded for a new account.
 *
 * Chosen to cover what a Nigerian bank statement actually contains, with income
 * and spend kept distinct because the two answer different questions and are
 * taxed differently. Editable from day one — this is a starting set, not a
 * fixed taxonomy.
 */
export const DEFAULT_INCOME_CATEGORIES = [
  "Work payment",
  "Salary",
  "Business sales",
  "Interest income",
  "Gift / family support",
  "Loan received",
  "Refund",
  "Other income",
  /**
   * Yield and other investment income earned on a stablecoin.
   *
   * Kept separate from "Interest income" on purpose: a bank pays interest on a
   * deposit and a protocol pays a reward on a token, and only the second one
   * needs a wallet history behind it when someone checks the figure. Tax
   * treatment of the two also differs by jurisdiction — see tax/treatment.ts,
   * where this is taxable on receipt everywhere except the UK.
   */
  "Yield / investment income",
] as const;

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Phone & Data",
  "Transport",
  "Food & Groceries",
  "Rent & Housing",
  "Utilities",
  "Subscriptions",
  "Donations / Church",
  "Bank charges",
  "Cash withdrawal",
  "Health",
  "Education",
  "Shopping",
  "Other",
] as const;

/**
 * Categories for the two legs of a stablecoin conversion.
 *
 * Both are transfers, and neither is a category the user picks from a dropdown
 * during import — they are applied when a detected cash-out is confirmed. They
 * are seeded like any other category so the row has a real destination, and they
 * are labelled as transfers rather than spending, because putting a conversion
 * under a spend category would put the user's own money straight back into their
 * expense totals.
 */
export const DEFAULT_TRANSFER_CATEGORIES = [
  "Stablecoin cash-out",
  "Stablecoin purchase",
] as const;

export const DEFAULT_CATEGORIES = [
  ...DEFAULT_TRANSFER_CATEGORIES,
  ...DEFAULT_INCOME_CATEGORIES,
  ...DEFAULT_EXPENSE_CATEGORIES,
  // The protected catch-all. Seeded like any other category so a row can always
  // land somewhere real, and excluded from income/expense totals downstream.
  "Uncategorized",
] as const;

/**
 * Renames for the previous generic seeds, so an existing account's categories
 * are renamed rather than duplicated.
 *
 * Only unambiguous pairs are listed. "Income" and "Investments" are deliberately
 * absent: the old "Income" could have been a salary, a client payment or a
 * business receipt, and the old "Investments" is not "Business sales". Guessing
 * would move money into a category the user never chose and quietly change
 * their tax position, so those are left as the user's own categories and the
 * new defaults are simply added alongside them.
 */
export const LEGACY_CATEGORY_RENAMES: Record<string, string> = {
  housing: "Rent & Housing",
  groceries: "Food & Groceries",
  dining: "Food & Groceries",
  utilities: "Utilities",
  transport: "Transport",
  shopping: "Shopping",
  education: "Education",
  other: "Other",
  uncategorized: "Uncategorized",
};