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

export const DEFAULT_CATEGORIES = [
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