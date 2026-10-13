/**
 * The browser's copy of the stablecoin list.
 *
 * Mirrors `api/src/lib/stablecoins.ts` — the web app cannot import across the
 * api boundary, so the two lists are kept in step by
 * `api/src/lib/stablecoins.drift.test.ts`, which reads both files and fails if
 * they diverge. Add a token to both, in one commit.
 *
 * Before this existed the same list lived in three files here and two in the
 * API, all disagreeing: a token could show on the balance page and not in the
 * tax view, or appear in this tab and be priced as nothing.
 */

/** Pegged or near-pegged tokens held as assets. */
export const STABLECOIN_SYMBOLS = ["USDC", "USDC.E", "USDT", "CNGN", "DAI", "USDY"] as const;

/** A claim on something rather than the thing itself. */
export const YIELD_BEARING_SYMBOLS = ["sUSDe", "sUSDS", "aUSDC", "aUSDT", "cUSDe", "cUSDC", "sDAI"] as const;

/** Naira-pegged: no meaningful USD value. */
export const NAIRA_PEGGED_SYMBOLS = ["CNGN"] as const;

/**
 * Built from upper-cased literals, not the exported arrays.
 *
 * Yield tokens are conventionally written mixed-case — `sUSDe`, `aUSDC` — so
 * the exported lists hold `sUSDe` while every lookup normalises to `SUSDE`. A
 * set built from the literals directly would never match, and every
 * yield-bearing check would silently be false. The drift test compares the
 * exported arrays, not these sets, so the two can be correct independently.
 */
const STABLE_SET: ReadonlySet<string> = new Set([...STABLECOIN_SYMBOLS, ...YIELD_BEARING_SYMBOLS].map((symbol) => symbol.toUpperCase()));
const YIELD_SET: ReadonlySet<string> = new Set(YIELD_BEARING_SYMBOLS.map((symbol) => symbol.toUpperCase()));
const NAIRA_PEGGED_SET: ReadonlySet<string> = new Set(NAIRA_PEGGED_SYMBOLS.map((symbol) => symbol.toUpperCase()));

const normalise = (symbol: string | null | undefined) => (symbol ?? "").trim().toUpperCase();

export function isStablecoinAsset(symbol: string | null | undefined): boolean {
  return STABLE_SET.has(normalise(symbol));
}

/** Pegged base tokens only — what the stablecoin Insights tab counts. */
export function isPlainStablecoinAsset(symbol: string | null | undefined): boolean {
  const key = normalise(symbol);
  return STABLE_SET.has(key) && !YIELD_SET.has(key);
}

/**
 * True for a naira-pegged token such as cNGN.
 *
 * Its value is already naira, so it must never be summed into a dollar figure:
 * doing so adds two orders of magnitude to a total labelled in another
 * currency, which reads as a small rounding difference rather than an error.
 */
export function isNairaPeggedAsset(symbol: string | null | undefined): boolean {
  return NAIRA_PEGGED_SET.has(normalise(symbol));
}

export function isYieldBearingAsset(symbol: string | null | undefined): boolean {
  return YIELD_SET.has(normalise(symbol));
}

/** Every stable token, for pickers and balance breakdowns. */
export const ALL_STABLE_SYMBOLS: readonly string[] = [...STABLECOIN_SYMBOLS, ...YIELD_BEARING_SYMBOLS];

/** Short human label for a list of tokens, e.g. "USDC · USDT · CNGN". */
export function stableTokenLabel(symbols: readonly string[]): string {
  return symbols.join(" · ");
}
/**
 * Asset colours, shared so a token reads the same on the balance page and in
 * the stablecoin tab. These were duplicated per page and had already drifted:
 * the wallet page knew about ETH and SOL, the stablecoin tab did not, and
 * neither knew about DAI or USDY.
 *
 * An asset with no entry falls back to a deterministic hue, so a newly listed
 * token still gets a stable colour rather than none.
 */
export const ASSET_COLORS: Record<string, string> = {
  USDC: "#2775ca",
  "USDC.E": "#2775ca",
  USDT: "#26a17b",
  DAI: "#f5ac37",
  USDY: "#0f9d58",
  CNGN: "#7c3aed",
  sUSDe: "#7c3aed",
  sUSDS: "#7c3aed",
  cUSDe: "#7c3aed",
  cUSDC: "#2775ca",
  aUSDC: "#2775ca",
  aUSDT: "#26a17b",
  sDAI: "#f5ac37",
  ETH: "#627eea",
  SOL: "#14f195",
};

/** Palette colour, or a deterministic hue for anything it does not know. */
export function colorForAsset(symbol: string): string {
  const upper = (symbol ?? "").toUpperCase();
  const known = ASSET_COLORS[upper];
  if (known) return known;
  let hash = 0;
  for (const char of upper) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return `hsl(${hash} 62% 52%)`;
}
