/**
 * Product surface flags.
 *
 * A flag set to `false` hides the feature from nav and returns early from its
 * routes, but the components, routes, and API behind it stay in the tree so the
 * feature can be turned back on by flipping the flag. Nothing is deleted.
 */
export const FEATURES = {
  /** Budgeting: nav entry, /budget route, dashboard snapshot card. */
  budgeting: false,
  /** Goals: nav entry, /budget/goals route, quick-create goal action. */
  goals: false,
} as const;

export type FeatureFlag = keyof typeof FEATURES;

export function featureEnabled(flag: FeatureFlag): boolean {
  return FEATURES[flag];
}

/**
 * Wallets the free tier may connect. Mirrors `FREE_WALLET_LIMIT` in
 * `api/src/middleware/plan.ts` — the API stays the authority on the limit, and
 * this only decides whether to offer the Connect button or the upgrade prompt.
 */
export const FREE_WALLET_LIMIT = 1;
