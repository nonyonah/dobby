import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The stablecoin list existed in five files and all five disagreed.
 *
 * The API priced a contract allowlist, the tax route force-taxed a third set of
 * symbols, the Insights tab filtered by a fourth, and the wallet summary by a
 * fifth. Each was correct on the day it was written. A token could be valued on
 * the balance page and invisible in the tax view, or counted in the stablecoin
 * tab and priced as nothing.
 *
 * The api and web now each hold one list, and this test is what stops them
 * drifting apart again — the web cannot import across the api boundary, so two
 * files have to be kept in step by something.
 *
 * Reading the files rather than importing them is deliberate: importing would
 * share one list and prove nothing, which is the arrangement that let five
 * copies diverge in the first place.
 */

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");

const apiSource = read("api/src/lib/stablecoins.ts");
const webSource = read("web/lib/stablecoins.ts");

/** Pulls a `as const` string array literal out of a source file. */
function arrayIn(source: string, name: string): string[] {
  const match = new RegExp(`export const ${name} = \\[([^\\]]*)\\]`).exec(source);
  if (!match) throw new Error(`could not find ${name} in the source`);
  return [...match[1]!.matchAll(/"([^"]+)"/g)].map((entry) => entry[1]!);
}

describe("stablecoin list", () => {
  it("shares one stablecoin list between api and web", () => {
    expect(arrayIn(webSource, "STABLECOIN_SYMBOLS")).toEqual(arrayIn(apiSource, "STABLECOIN_SYMBOLS"));
  });

  it("shares one yield-bearing list", () => {
    expect(arrayIn(webSource, "YIELD_BEARING_SYMBOLS")).toEqual(arrayIn(apiSource, "YIELD_BEARING_SYMBOLS"));
  });

  it("shares one naira-pegged list", () => {
    expect(arrayIn(webSource, "NAIRA_PEGGED_SYMBOLS")).toEqual(arrayIn(apiSource, "NAIRA_PEGGED_SYMBOLS"));
  });

  it("keeps the new tokens in the shared list", () => {
    // The tokens added for cash-out and yield detection. Dropping one from
    // either copy is exactly the regression this test exists to catch.
    const symbols = arrayIn(apiSource, "STABLECOIN_SYMBOLS");
    for (const token of ["USDC", "USDT", "CNGN", "DAI", "USDY"]) {
      expect(symbols, `${token} missing from the shared stablecoin list`).toContain(token);
    }
    const yieldTokens = arrayIn(apiSource, "YIELD_BEARING_SYMBOLS");
    for (const token of ["sUSDe", "sUSDS", "aUSDC", "aUSDT"]) {
      expect(yieldTokens, `${token} missing from the yield-bearing list`).toContain(token);
    }
  });

  it("never treats a yield-bearing token as plain spending", () => {
    // The two sets are disjoint because a yield token is a claim on something,
    // not the something itself; a receipt of one is a transfer until redeemed.
    const plain = new Set(arrayIn(apiSource, "STABLECOIN_SYMBOLS"));
    for (const token of arrayIn(apiSource, "YIELD_BEARING_SYMBOLS")) {
      expect(plain.has(token), `${token} is in both the plain and yield-bearing lists`).toBe(false);
    }
  });

  it("leaves no other copy of the list behind", () => {
    // Each of these is how a fifth copy got added: an inline array of string
    // literals, next to the shared list. Matched on the leading quote so a
    // legitimate spread of the shared set does not trip the guard.
    // `api/src/lib/stablecoins.ts` and `web/lib/stablecoins.ts` are excluded:
    // those two are the list, and they necessarily declare it as literals.
    const inlineLiteral = /=\s*\[["']/;
    expect(read("api/src/routes/tax.ts")).not.toMatch(/taxableWalletAssets/);
    expect(read("web/components/stablecoin-section.tsx")).not.toMatch(inlineLiteral);
    expect(read("web/lib/wallet-summary.ts")).not.toMatch(inlineLiteral);
  });
});
describe("net worth pricing", () => {
  const netWorth = read("api/src/lib/net-worth.ts");

  it("prices the new yield-bearing tokens instead of excluding them", () => {
    // They are in no contract allowlist, because filling that in needs verified
    // addresses. Left on the contract-only path they were counted as unpriced:
    // visible in the wallet, absent from the net worth, with no explanation.
    expect(netWorth).toMatch(/YIELD_BEARING_SET\.has\(symbol\)/);
    expect(netWorth).toMatch(/usdValue = balance\.amount/);
  });

  it("still matches a known contract by contract, not by symbol", () => {
    // The fallback is for yield tokens only. Anyone can mint an ERC-20 reading
    // "USDC", so the dollar peg must never be applied on a symbol match.
    const fallbackIndex = netWorth.indexOf("YIELD_BEARING_SET.has(symbol)");
    const plainUsdcCheck = netWorth.indexOf("STABLE_CONTRACTS.has(key)");
    expect(plainUsdcCheck).toBeGreaterThan(-1);
    expect(fallbackIndex).toBeGreaterThan(plainUsdcCheck);
    expect(netWorth).not.toMatch(/STABLECOIN_SYMBOLS\.has\(symbol\)[\s\S]{0,120}= balance\.amount/);
  });

  it("converts holdings into the profile currency rather than relabelling them", () => {
    expect(netWorth).toMatch(/displayValue: usdValue === null \? null : round2\(usdValue \* usdToDisplay\)/);
    expect(netWorth).toMatch(/displayCurrency,/);
  });

  it("charges for the extra rate call only when the currency differs", () => {
    // A USD profile needs no second conversion; making everyone pay for it
    // would be a wasted upstream request on every net-worth load.
    expect(netWorth).toMatch(/displayCurrency === "USD" \? 1 :/);
  });
});

describe("formatUSD is not a conversion", () => {
  /*
   * The third time. `formatUSD` reads the app currency and prints the number
   * with that currency's symbol and locale — it converts nothing. So every
   * dollar figure rendered through it comes out wearing the wrong unit, and
   * "$707" reads as "₦707": a number that is right and a unit that is not.
   *
   * It is a fine function for a figure already in the app currency, which is
   * most of them. The failure is always the same shape — a USD value reaching
   * it — so the guard is that the obvious USD spots do not.
   */
  const wallet = read("web/components/wallet-detail.tsx");

  it("converts the total-spent card rather than relabelling it", () => {
    expect(wallet).not.toMatch(/label="Total spent"[\s\S]{0,200}formatUSD\(/);
    expect(wallet).toMatch(/label="Total spent"[\s\S]{0,200}formatCurrency\(/);
  });

  it("keeps naira-pegged tokens out of a dollar total", () => {
    // Adding 40,000 naira to a figure labelled dollars is not a rounding error.
    expect(wallet).toMatch(/isNairaPeggedAsset\(symbol\)\s*\? peggedByAsset : spentByAsset/);
  });

  it("converts through one helper, so a fix cannot land on one figure and miss the other", () => {
    expect(wallet).toMatch(/async function convertUsd\(/);
    // Two inline conversions were how holdings and spending drifted apart.
    const inline = wallet.match(/currency\/convert\?amount=/g) ?? [];
    expect(inline.length).toBeLessThanOrEqual(1);
  });

  it("labels the asset list with the currency the API converted into", () => {
    // `assets` carries displayValue, so formatUSD re-labels an already-converted
    // figure with whatever unit the device happens to prefer.
    expect(wallet).not.toMatch(/tabular-nums\}>\{formatUSD\(asset\.amount\)\}/);
  });
});

describe("chart currency", () => {
  const pie = read("web/components/breakdown-pie.tsx");
  const wallet = read("web/components/wallet-detail.tsx");

  it("can format a chart in an explicit currency", () => {
    expect(pie).toMatch(/currency\?: string;/);
    expect(pie).toMatch(/formatCurrency\(item\.amount, currency\)/);
  });

  it("passes the snapshot currency from the wallet holdings chart", () => {
    expect(wallet).toMatch(/currency=\{snapshot\?\.displayCurrency/);
  });

  it("draws the converted value, not the dollar one", () => {
    // The bug: formatUSD renders the app currency symbol around a dollar figure,
    // so a $0.04 holding read as ₦0.04.
    expect(wallet).toMatch(/holding\.displayValue === null/);
    expect(wallet).not.toMatch(/totals\.get\(symbol\) \?\? 0\) \+ holding\.usdValue/);
  });
});
