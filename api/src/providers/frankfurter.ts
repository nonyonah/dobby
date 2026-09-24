import { AppError } from "../middleware/errors.js";

const cache = new Map<string, { expiresAt: number; rates: Record<string, number>; date: string }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

export async function getFrankfurterRates(base: string, quotes: string[]) {
  const normalizedBase = base.toUpperCase();
  const normalizedQuotes = [...new Set(quotes.map((quote) => quote.toUpperCase()).filter((quote) => quote !== normalizedBase))].sort();
  if (normalizedQuotes.length === 0) return { base: normalizedBase, date: new Date().toISOString().slice(0, 10), rates: {} };
  const key = `${normalizedBase}:${normalizedQuotes.join(",")}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return { base: normalizedBase, date: cached.date, rates: cached.rates };

  const url = new URL("https://api.frankfurter.dev/v2/rates");
  url.searchParams.set("base", normalizedBase);
  url.searchParams.set("quotes", normalizedQuotes.join(","));
  const response = await fetch(url);
  const payload = await response.json() as { date?: string; base?: string; quote?: string; rate?: number }[] | { message?: string };
  if (!response.ok || !Array.isArray(payload)) throw new AppError(502, "Frankfurter could not provide exchange rates.", "FRANKFURTER_UPSTREAM_ERROR");

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
