import { AppError } from "../middleware/errors.js";

const cache = new Map<string, { expiresAt: number; rates: Record<string, number>; date: string }>();
const CACHE_TTL_MS = 60 * 60 * 1000;
/** Upstream is a free public API and rate-limits/hangs under load. */
const FETCH_TIMEOUT_MS = 4_000;
/** Remember a hard failure briefly so one bad upstream cannot stall every request. */
const FAILURE_TTL_MS = 60 * 1000;
const failures = new Map<string, number>();

export async function getFrankfurterRates(base: string, quotes: string[]) {
  const normalizedBase = base.toUpperCase();
  const normalizedQuotes = [...new Set(quotes.map((quote) => quote.toUpperCase()).filter((quote) => quote !== normalizedBase))].sort();
  if (normalizedQuotes.length === 0) return { base: normalizedBase, date: new Date().toISOString().slice(0, 10), rates: {} };
  const key = `${normalizedBase}:${normalizedQuotes.join(",")}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return { base: normalizedBase, date: cached.date, rates: cached.rates };
  const failedUntil = failures.get(key);
  if (failedUntil !== undefined && failedUntil > Date.now()) throw new AppError(502, "Frankfurter could not provide exchange rates.", "FRANKFURTER_UPSTREAM_ERROR");

  const url = new URL("https://api.frankfurter.dev/v2/rates");
  url.searchParams.set("base", normalizedBase);
  url.searchParams.set("quotes", normalizedQuotes.join(","));
  let payload: { date?: string; base?: string; quote?: string; rate?: number }[] | { message?: string };
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    payload = await response.json() as typeof payload;
    if (!response.ok || !Array.isArray(payload)) throw new Error(`upstream ${response.status}`);
  } catch (error) {
    failures.set(key, Date.now() + FAILURE_TTL_MS);
    throw new AppError(502, "Frankfurter could not provide exchange rates.", "FRANKFURTER_UPSTREAM_ERROR");
  }

  const rates = Object.fromEntries(payload.filter((row) => row.quote && Number.isFinite(row.rate)).map((row) => [row.quote!.toUpperCase(), row.rate!]));
  const result = { base: normalizedBase, date: payload[0]?.date ?? new Date().toISOString().slice(0, 10), rates };
  cache.set(key, { ...result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

export async function convertCurrencyAmount(amount: number, from: string, to: string) {
  const source = from.toUpperCase();
  const target = to.toUpperCase();
  if (source === target) return amount;
  try {
    const result = await getFrankfurterRates(source, [target]);
    const rate = result.rates[target];
    if (rate !== undefined && Number.isFinite(rate)) return amount * rate;
  } catch {
    // Try the inverse pair below; this also handles providers that only expose one direction.
  }
  const inverse = await getFrankfurterRates(target, [source]);
  const inverseRate = inverse.rates[source];
  if (inverseRate === undefined || !Number.isFinite(inverseRate) || inverseRate === 0) throw new AppError(502, `No Frankfurter rate is available for ${source} to ${target}.`, "FRANKFURTER_RATE_UNAVAILABLE");
  return amount / inverseRate;
}

/**
 * Conversion factors for many source currencies into one target, in a single
 * upstream request rather than one per currency. The insights/net-worth
 * aggregates needed one rate call per distinct currency, awaited serially,
 * which on a cold cache took ~15s and tripped the web client's request timeout.
 * Unknown pairs fall back to identity, matching the previous per-currency
 * behaviour of degrading instead of failing the whole endpoint.
 */
export async function getConversionFactors(sources: Iterable<string>, target: string) {
  const goal = target.toUpperCase();
  const unique = [...new Set([...sources].map((source) => source.toUpperCase()))];
  const factors = new Map<string, number>(unique.map((source) => [source, source === goal ? 1 : 1]));
  const wanted = unique.filter((source) => source !== goal);
  if (wanted.length === 0) return factors;

  // Preferred: one batched call quoting the goal, then invert to get
  // source -> goal. Anything the batch could not resolve falls back to the
  // per-pair lookup, and finally to identity so totals stay computable.
  try {
    const forward = await getFrankfurterRates(goal, wanted);
    for (const source of wanted) {
      const rate = forward.rates[source];
      if (rate !== undefined && Number.isFinite(rate) && rate !== 0) factors.set(source, 1 / rate);
    }
  } catch {
    // Fall through to the per-pair path below.
  }

  const unresolved = wanted.filter((source) => factors.get(source) === 1);
  if (unresolved.length > 0) {
    await Promise.all(unresolved.map(async (source) => {
      try {
        factors.set(source, await convertCurrencyAmount(1, source, goal));
      } catch {
        // Keep identity: the amount is still reported, just unconverted.
      }
    }));
  }
  return factors;
}
