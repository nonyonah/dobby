import { describe, expect, it } from "vitest";
import { isoDateFromUnixSeconds } from "../../../web/lib/wallet-dates.js";

/**
 * A bad timestamp took the whole wallet page down.
 *
 * `Date.prototype.toISOString` throws `RangeError: Invalid time value` on an
 * invalid Date, and it was called inside a `map` during render, so nothing could
 * catch it: the route rendered, then died with "this page could not be loaded".
 * The provider sends `blockTimestamp` as a number on some responses and as a
 * string on others, and `"0x64" * 1000` is NaN — so `new Date(NaN)` is invalid
 * and `toISOString()` throws.
 *
 * This runs from the api suite because the web package has no test runner. It
 * imports the real module, not a copy, so it fails if the helper regresses.
 */
describe("wallet transfer dates", () => {
  it("formats a unix timestamp", () => {
    expect(isoDateFromUnixSeconds(1_700_000_000)).toBe("2023-11-14");
  });

  it("accepts a numeric string", () => {
    expect(isoDateFromUnixSeconds("1700000000")).toBe("2023-11-14");
  });

  it("accepts a hex string", () => {
    expect(isoDateFromUnixSeconds("0x6553f100")).toBe("2023-11-14");
  });

  it("never throws on anything the provider might send", () => {
    // The crash was a throw inside a render-time map, so the only requirement
    // that matters is that none of these escape.
    for (const value of ["0x", "0xZZ", "not-a-number", "", null, undefined, Number.NaN, Number.POSITIVE_INFINITY, 1e18, -1e18, {} as never, [] as never]) {
      expect(() => isoDateFromUnixSeconds(value as never), JSON.stringify(value)).not.toThrow();
      expect(typeof isoDateFromUnixSeconds(value as never), JSON.stringify(value)).toBe("string");
    }
  });

  it("returns blank for values that cannot be a date at all", () => {
    for (const value of ["not-a-number", "", null, undefined, Number.NaN, 0, -1]) {
      expect(isoDateFromUnixSeconds(value as never), String(value)).toBe("");
    }
  });

  it("keeps a small but real timestamp rather than discarding it", () => {
    // 100 seconds is a valid date, if an implausible one. Blanking it would hide
    // a value the provider did send; the crash we care about is NaN, not this.
    expect(isoDateFromUnixSeconds("0x64")).toBe("1970-01-01");
  });

  it("never substitutes today for an unusable timestamp", () => {
    // Today would sort a two-year-old transfer to the top of the list and read
    // as the most recent thing that happened.
    const today = new Date().toISOString().slice(0, 10);
    expect(isoDateFromUnixSeconds("garbage")).not.toBe(today);
  });
});
