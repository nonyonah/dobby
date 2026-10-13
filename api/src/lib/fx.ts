/**
 * Reference FX rates for stablecoin cash-outs.
 *
 * Nigeria's NRS guidance works a gain out in USD first and then converts at the
 * CBN/NAFEM rate on the date of disposal. Dobby has no CBN feed, so this is an
 * interface with a documented default rather than a claim to be authoritative.
 *
 * The fallback order is deliberate and each step is weaker than the last:
 *
 *   1. a configured reference provider (CBN/NAFEM when one is wired in),
 *   2. the median implied rate of the user's own confirmed cash-outs,
 *   3. the market rate from Frankfurter.
 *
 * Step 2 is preferred over step 3 on purpose. Frankfurter's NGN is a market
 * rate, not the official one, and an offramp's own spread is usually a better
 * approximation of what this user actually receives than a published mid is.
 * Every consumer treats a null rate as "cannot verify" rather than as zero —
 * `getConversionFactors` falls back to identity on failure, which would silently
 * make ₦1 equal $1 and inflate every Nigerian figure, so nothing here does.
 */

import { getFrankfurterRates } from "../providers/frankfurter.js";

export type FxRate = { rate: number; /** ISO date the rate is quoted for. */ date: string; source: FxRateSource };

export type FxRateSource = "configured" | "implied_median" | "market";

/**
 * Plug a provider in here. A CBN/NAFEM implementation returns the naira per
 * one dollar for a given day and nothing else.
 */
export type FxRateProvider = (args: { pair: string; on: Date }) => Promise<FxRate | null>;

/** `NGNUSD` means "naira per one dollar". */
export const NGN_PER_USD = "NGNUSD";

const cache = new Map<string, { expiresAt: number; rate: FxRate }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let configured: FxRateProvider | null = null;

/** Wire a reference provider (CBN/NAFEM). Pass null to fall back. */
export function setFxRateProvider(provider: FxRateProvider | null): void {
  configured = provider;
  cache.clear();
}

/**
 * Naira per dollar on a date, or null when nothing can be established.
 *
 * Null is a real answer and callers must honour it: an unverifiable rate is not
 * the same as a rate of 1, and treating it as one would turn every naira figure
 * into a dollar figure without saying so.
 */
export async function ngnPerUsd(args: { on: Date; impliedRates?: number[] }): Promise<FxRate | null> {
  const day = args.on.toISOString().slice(0, 10);
  const cached = cache.get(day);
  if (cached && cached.expiresAt > Date.now()) return cached.rate;

  if (configured) {
    const provided = await configured({ pair: NGN_PER_USD, on: args.on });
    if (provided && Number.isFinite(provided.rate) && provided.rate > 0) {
      cache.set(day, { expiresAt: Date.now() + CACHE_TTL_MS, rate: provided });
      return provided;
    }
  }

  // The user's own confirmed cash-outs know what their offramp actually paid.
  const implied = median(args.impliedRates ?? []);
  if (implied !== null) {
    const rate = { rate: implied, date: day, source: "implied_median" as const };
    cache.set(day, { expiresAt: Date.now() + CACHE_TTL_MS, rate });
    return rate;
  }

  const market = await marketRate(day);
  if (market) cache.set(day, { expiresAt: Date.now() + CACHE_TTL_MS, rate: market });
  return market;
}

async function marketRate(day: string): Promise<FxRate | null> {
  try {
    const rates = await getFrankfurterRates("USD", ["NGN"]);
    const rate = rates.rates?.NGN;
    if (rate === undefined || !Number.isFinite(rate) || rate <= 0) return null;
    return { rate, date: rates.date ?? day, source: "market" };
  } catch {
    return null;
  }
}

/** Median, not mean: one bad cash-out should not move everybody's rate. */
export function median(values: number[]): number | null {
  const clean = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 === 1 ? clean[mid]! : (clean[mid - 1]! + clean[mid]!) / 2;
}

/**
 * Whether an implied rate is close enough to the reference to be the same trade.
 *
 * Returns false when there is no reference at all, rather than true. An
 * unverifiable pairing is a narration-only suggestion at best, and letting it
 * through here would promote it to a confirmed pairing on the strength of
 * nothing.
 */
export function rateAgrees(implied: number, reference: FxRate | null, tolerance: number): boolean {
  if (!reference) return false;
  if (!Number.isFinite(implied) || implied <= 0) return false;
  return Math.abs(implied - reference.rate) / reference.rate <= tolerance;
}

/** Suggested rates, which must not influence the reference a pair is judged against. */
export async function impliedRatesFromConfirmed(rates: number[]): Promise<number[]> {
  return rates;
}