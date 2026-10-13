/**
 * Detection tuning.
 *
 * Every threshold here is a judgement about how confident a match is, and the
 * defaults are deliberately conservative: a wrong cash-out or a wrong yield
 * figure lands in someone's tax estimate, and a missed suggestion costs the user
 * one tap they would have taken anyway.
 */

import { z } from "zod";

const env = {
  OFFRAMP_MATCH_WINDOW_HOURS: z.coerce.number().int().min(1).max(168).default(6),
  /**
   * How far the user's own implied rate may sit from a reference rate before a
   * pairing is rejected. Offramps pay a spread, so exact equality would reject
   * every real cash-out; too wide and unrelated naira credit gets matched to an
   * unrelated stablecoin outflow.
   */
  OFFRAMP_RATE_TOLERANCE: z.coerce.number().min(0.005).max(0.5).default(0.08),
  /** How far back a pairing may look for the other leg. */
  ONCHAIN_LOOKBACK_DAYS: z.coerce.number().int().min(1).max(90).default(14),
};

export type StablecoinConfig = { OFFRAMP_MATCH_WINDOW_HOURS: number; OFFRAMP_RATE_TOLERANCE: number; ONCHAIN_LOOKBACK_DAYS: number };

export function stablecoinConfig(): StablecoinConfig {
  return {
    OFFRAMP_MATCH_WINDOW_HOURS: env.OFFRAMP_MATCH_WINDOW_HOURS.safeParse(process.env.OFFRAMP_MATCH_WINDOW_HOURS ?? "").data ?? 6,
    OFFRAMP_RATE_TOLERANCE: env.OFFRAMP_RATE_TOLERANCE.safeParse(process.env.OFFRAMP_RATE_TOLERANCE ?? "").data ?? 0.08,
    ONCHAIN_LOOKBACK_DAYS: env.ONCHAIN_LOOKBACK_DAYS.safeParse(process.env.ONCHAIN_LOOKBACK_DAYS ?? "").data ?? 14,
  };
}

/** Tokens whose USD value is not meaningful: naira-pegged. */
export const NAIRA_PEGGED_TOKENS = new Set(["CNGN", "NGNC", "CNGN"]);

/** Whether a token's value should be recorded in USD at all. */
export function isUsdValued(token: string): boolean {
  return !NAIRA_PEGGED_TOKENS.has(token.trim().toUpperCase());
}

/** Stablecoins the wallet reader treats as assets rather than a stake in them. */
export const STABLE_TOKENS = new Set(["USDC", "USDC.E", "USDT", "CNGN", "DAI", "USDY"]);

/**
 * Tokens that represent a claim on underlying rather than the underlying
 * itself. Receiving one of these is usually a transfer; redeeming one is what
 * realises anything, and is the only moment worth calling a gain.
 */
export function isYieldBearing(token: string): boolean {
  return /^(sUSDe|sUSDS|aUSDC|aUSDT|cUSDe|cUSDC|SDAI|SUSDe)$/i.test(token.trim());
}

/** Confidence bands, named so a score never appears in a card unexplained. */
export const CONFIDENCE = {
  /** Receipt or "withdrawal complete" email from the provider itself. */
  providerEmail: 0.95,
  /** On-chain outflow plus a naira credit at a sane rate. */
  paired: 0.85,
  /** Same, but the outflow went to a known offramp address. */
  pairedKnownAddress: 0.95,
  /** Narration only. */
  narration: 0.6,
  /** Repeated small inflows from one contract, wallet flagged as earning. */
  repeatedInflows: 0.7,
  /** Something that could be yield but could not be proven. */
  possibleYield: 0.5,
} as const;