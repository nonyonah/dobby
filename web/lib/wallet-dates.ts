/**
 * Coercing provider timestamps into something formattable.
 *
 * Extracted from the wallet page rather than left inline, because it is the only
 * part of that page with a non-obvious failure and it should be testable without
 * standing up the whole route.
 */

/**
 * A unix timestamp as `YYYY-MM-DD`, or "" when there isn't a usable one.
 *
 * `toISOString` throws on an invalid Date, and it will happily receive one: the
 * provider sends `blockTimestamp` as a string on some responses and as a hex
 * string on others, and `"0x64" * 1000` is NaN, so `new Date(NaN)` is invalid and
 * `.toISOString()` throws `RangeError`. That took the whole wallet page down —
 * the crash happened inside a `map` during render, so nothing could catch it.
 *
 * Blank is the right answer for a missing date. Substituting today would be
 * worse: it would sort a two-year-old transfer to the top of the list and read
 * as the most recent thing that happened.
 */
export function isoDateFromUnixSeconds(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const seconds = typeof value === "string" && /^0x/i.test(value.trim()) ? Number.parseInt(value.trim(), 16) : Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const date = new Date(seconds * 1000);
  const time = date.getTime();
  if (!Number.isFinite(time)) return "";
  return date.toISOString().slice(0, 10);
}

