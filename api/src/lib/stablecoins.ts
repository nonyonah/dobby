/**
 * The one definition of what counts as a stablecoin.
 *
 * This list existed in five places, and they had all drifted apart: the API
 * priced a contract allowlist, the tax route force-taxed a third set, the
 * Insights tab filtered by a fourth, and the wallet summary by a fifth. Each
 * was correct when written and none agreed with the others, so a token could be
 * valued by the balance page and invisible in the tax view, or appear in the
 * stablecoin tab and be untaxable.
 *
 * `web/lib/stablecoins.ts` mirrors the symbol lists for the browser, and
 * `stablecoins.drift.test.ts` fails if the two ever disagree. Adding a token
 * means adding it here and mirroring it there, in one commit.
 *
 * Two questions are kept apart on purpose:
 *
 * - **What is a stablecoin** (this module) — classification, for display and
 *   for deciding a movement is an asset conversion rather than a purchase.
 * - **What is this exact contract** (`STABLE_CONTRACTS`) — identity, for pricing.
 *
 * Collapsing them would mean pricing by symbol, and anyone can mint an ERC-20
 * that reads "USDC".
 */

/** Pegged or near-pegged tokens held as assets. */
export const STABLECOIN_SYMBOLS = ["USDC", "USDC.E", "USDT", "CNGN", "DAI", "USDY"] as const;

/**
 * Tokens that are a claim on something rather than the thing itself.
 *
 * Receiving one of these is normally a transfer; redeeming one is what realises
 * anything. Treating the receipt as income would tax a principal return.
 */
export const YIELD_BEARING_SYMBOLS = ["sUSDe", "sUSDS", "aUSDC", "aUSDT", "cUSDe", "cUSDC", "sDAI"] as const;

/** Naira-pegged: a USD value is meaningless, so none is recorded. */
export const NAIRA_PEGGED_SYMBOLS = ["CNGN"] as const;

/**
 * Built from upper-cased literals, not from the exported arrays.
 *
 * Yield tokens are conventionally written mixed-case — `sUSDe`, `aUSDC` — so
 * the exported lists hold `sUSDe` while every lookup normalises to `SUSDE`. A
 * set built from the literals directly never matches, and every yield-bearing
 * check is silently false: no yield receipt recognised, no redemption paired,
 * no suggestion raised. The drift test compares the exported arrays, not these
 * sets, so the two can disagree without it noticing.
 */
export const STABLE_TOKEN_SET: ReadonlySet<string> = new Set([...STABLECOIN_SYMBOLS, ...YIELD_BEARING_SYMBOLS].map((symbol) => symbol.toUpperCase()));
export const YIELD_BEARING_SET: ReadonlySet<string> = new Set(YIELD_BEARING_SYMBOLS.map((symbol) => symbol.toUpperCase()));
export const NAIRA_PEGGED_SET: ReadonlySet<string> = new Set(NAIRA_PEGGED_SYMBOLS.map((symbol) => symbol.toUpperCase()));

const normalise = (symbol: string | null | undefined) => (symbol ?? "").trim().toUpperCase();

/** True for anything Dobby treats as a stable asset, yield-bearing included. */
export function isStablecoinSymbol(symbol: string | null | undefined): boolean {
  return STABLE_TOKEN_SET.has(normalise(symbol));
}

/** True only for the pegged base tokens, not the yield-bearing ones. */
export function isPlainStablecoin(symbol: string | null | undefined): boolean {
  const key = normalise(symbol);
  return STABLE_TOKEN_SET.has(key) && !YIELD_BEARING_SET.has(key);
}

export function isYieldBearingSymbol(symbol: string | null | undefined): boolean {
  return YIELD_BEARING_SET.has(normalise(symbol));
}

/** Whether a USD value should be recorded at all. */
export function isUsdValued(symbol: string | null | undefined): boolean {
  return !NAIRA_PEGGED_SET.has(normalise(symbol));
}

export function isNairaPeggedSymbol(symbol: string | null | undefined): boolean {
  return NAIRA_PEGGED_SET.has(normalise(symbol));
}

/**
 * Contracts used for pricing, keyed `chain:address`.
 *
 * Matching is by contract and never by symbol: an ERC-20 with the symbol "USDC"
 * is not Circle's USDC, and pricing someone's holding of it against a dollar
 * peg would silently overstate a net worth.
 */
export const STABLE_CONTRACTS: ReadonlySet<string> = new Set([
  "base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC (Circle, Base)
  "base:0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", // USDC.e (bridged, Base)
  "solana:epjfddd5aufqssqem2qn1xzybapc8g4wegkzWytdt1v", // USDC
  "solana:es9vmfrzaceremjjfrf4h2fyd4kcokny11mcce8benwnyb", // USDT
]);

/** Ethereum-shaped addresses are compared lower-cased; Solana mints are not. */
export function contractKey(chain: string, address: string | null | undefined): string | null {
  if (!address) return null;
  const key = chain.toLowerCase() === "base" ? address.toLowerCase() : address;
  return `${chain.toLowerCase()}:${key}`;
}