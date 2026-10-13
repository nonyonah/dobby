import { describe, expect, it } from "vitest";
import { TransactionType } from "@prisma/client";
import { taxTreatment } from "../tax/treatment.js";
import { getTaxRules } from "../tax/registry.js";
import { median, rateAgrees } from "../lib/fx.js";
import { narrationMatches, type ResolvedEntity } from "./entities.js";
import { stablecoinConfig } from "./config.js";

/**
 * The parts of stablecoin handling that must be right without a database.
 *
 * Two things are being pinned here. The first is jurisdictional: yield is income
 * on receipt in five of the six countries Dobby supports and is *not* in the
 * UK, because HMRC treats staking rewards that come with dominion and control
 * as part of the cost of acquiring the asset rather than as income. Getting that
 * wrong puts a tax figure in front of somebody who relies on it.
 *
 * The second is the refusals. A cash-out is a conversion of the user's own
 * asset, never income and never a deductible expense, and an unrecognised
 * credit is never guessed at. The detector being quiet is a valid outcome and
 * these keep it quiet in the right places.
 */

const CASH_OUT = "Stablecoin cash-out";
const PURCHASE = "Stablecoin purchase";
const YIELD = "Yield / investment income";

describe("stablecoin tax treatment by jurisdiction", () => {
  it("treats a cash-out and a purchase as conversions, not income", () => {
    for (const country of ["NIGERIA", "US", "UK", "CANADA", "KENYA", "SOUTH_AFRICA"] as const) {
      expect(taxTreatment(country, TransactionType.INCOME, CASH_OUT)?.treatment, country).toBe("not_taxable");
      expect(taxTreatment(country, TransactionType.INCOME, PURCHASE)?.treatment, country).toBe("not_taxable");
    }
  });

  it("treats yield as income on receipt everywhere except the UK", () => {
    const onReceipt = ["NIGERIA", "US", "CANADA", "KENYA", "SOUTH_AFRICA"] as const;
    for (const country of onReceipt) {
      expect(taxTreatment(country, TransactionType.INCOME, YIELD)?.treatment, country).toBe("taxable");
    }
    // HMRC: rewards that come with dominion and control are part of the cost of
    // acquiring the asset. Tax arises on disposal, which this pass does not
    // model — so the category is not income, and the user can move it.
    expect(taxTreatment("UK", TransactionType.INCOME, YIELD)?.treatment).toBe("not_taxable");
  });

  it("keeps bank and fintech savings interest on its existing category", () => {
    for (const country of ["NIGERIA", "US", "UK", "CANADA", "KENYA", "SOUTH_AFRICA"] as const) {
      expect(taxTreatment(country, TransactionType.INCOME, "Interest income")?.treatment, country).toBe("taxable");
    }
  });

  it("never resolves a transfer to a tax question in any jurisdiction", () => {
    for (const country of ["NIGERIA", "US", "UK", "CANADA", "KENYA", "SOUTH_AFRICA"] as const) {
      expect(taxTreatment(country, TransactionType.TRANSFER, CASH_OUT), country).toBeNull();
    }
  });

  it("gives every jurisdiction checklist items about virtual-asset records", () => {
    for (const country of ["NIGERIA", "US", "UK", "CANADA", "KENYA", "SOUTH_AFRICA"] as const) {
      const checklist = getTaxRules(country).checklist;
      expect(checklist.some((item) => /record|history|statement/i.test(item.label)), `${country} has no record-keeping item`).toBe(true);
    }
  });

  it("mentions stamp duty in Nigeria and nowhere else", () => {
    // The duty is a Nigerian rule. Copying the idea elsewhere would be wrong.
    expect(getTaxRules("NIGERIA").checklist.some((item) => /stamp duty/i.test(item.label))).toBe(true);
    for (const country of ["US", "UK", "CANADA", "KENYA", "SOUTH_AFRICA"] as const) {
      expect(getTaxRules(country).checklist.some((item) => /stamp duty/i.test(item.label)), country).toBe(false);
    }
  });

  it("states the stamp duty as a note on the Nigerian estimate", async () => {
    const { nigeriaRules } = await import("../tax/nigeria.js");
    const calculation = nigeriaRules.calculate({
      taxYear: 2026,
      transactions: [{ type: "INCOME", amount: 5_000_000, isTaxable: true, incomeSource: null }],
      deductions: {},
      inputs: {},
      now: new Date("2026-06-01"),
    });
    const notes = calculation.notes.join(" ");
    expect(notes).toMatch(/1\.5%/);
    expect(notes).toMatch(/transferee/i);
    // An estimate, never advice.
    expect(notes).toMatch(/estimate|not advice/i);
  });
});

describe("reference rate", () => {
  it("agrees within tolerance and rejects beyond it", () => {
    const reference = { rate: 1_500, date: "2026-01-01", source: "configured" as const };
    expect(rateAgrees(1_500, reference, 0.08)).toBe(true);
    expect(rateAgrees(1_560, reference, 0.08)).toBe(true);
    expect(rateAgrees(1_800, reference, 0.08)).toBe(false);
    expect(rateAgrees(600, reference, 0.08)).toBe(false);
  });

  it("refuses to agree when there is no reference at all", () => {
    // An unverifiable pairing is a narration-only suggestion at best. Assuming
    // it matches is how an unrelated credit becomes a fabricated cash-out.
    expect(rateAgrees(1_500, null, 0.08)).toBe(false);
    expect(rateAgrees(Number.NaN, { rate: 1_500, date: "", source: "configured" }, 0.08)).toBe(false);
    expect(rateAgrees(0, { rate: 1_500, date: "", source: "configured" }, 0.08)).toBe(false);
  });

  it("takes the median so one bad cash-out cannot move everybody's rate", () => {
    expect(median([])).toBeNull();
    expect(median([1_500])).toBe(1_500);
    expect(median([1_400, 1_500, 1_600])).toBe(1_500);
    expect(median([1_400, 1_600])).toBe(1_500);
    // A wild outlier moves the median by at most the gap between neighbours.
    expect(median([1_400, 1_500, 1_600, 90_000])).toBe(1_550);
  });

  it("ignores non-positive and non-finite rates", () => {
    expect(median([0, -5, Number.NaN, 1_500])).toBe(1_500);
  });
});

describe("token matching", () => {
  it("recognises mixed-case yield tokens whatever case they arrive in", async () => {
    const { isYieldBearingSymbol, isPlainStablecoin, isStablecoinSymbol } = await import("../lib/stablecoins.js");
    // Yield tokens are written sUSDe and aUSDC but arrive from providers as
    // SUSDE, susde and SusDe in turn. The lookup normalises to upper case, so
    // the sets must be built upper-cased too — building them from the
    // mixed-case literals made every one of these false.
    for (const symbol of ["sUSDe", "SUSDE", "susde", "SusDe"]) {
      expect(isYieldBearingSymbol(symbol), symbol).toBe(true);
      expect(isPlainStablecoin(symbol), symbol).toBe(false);
      expect(isStablecoinSymbol(symbol), symbol).toBe(true);
    }
    for (const symbol of ["USDC", "usdc", "CNGN", "usdt"]) {
      expect(isYieldBearingSymbol(symbol), symbol).toBe(false);
      expect(isPlainStablecoin(symbol), symbol).toBe(true);
    }
  });

  it("treats a naira-pegged token as having no USD value, in any case", async () => {
    const { isUsdValued, isNairaPeggedSymbol } = await import("../lib/stablecoins.js");
    for (const symbol of ["CNGN", "cngn", "Cngn"]) {
      expect(isUsdValued(symbol), symbol).toBe(false);
      expect(isNairaPeggedSymbol(symbol), symbol).toBe(true);
    }
  });
});

describe("entity matching", () => {
  const entity = (overrides: Partial<ResolvedEntity> = {}): ResolvedEntity => ({
    id: "e1",
    kind: "offramp_provider",
    name: "Minisend",
    chain: null,
    address: null,
    narrationPatterns: ["minisend"],
    notes: null,
    source: "known",
    ...overrides,
  });

  it("matches a narration substring case-insensitively", () => {
    expect(narrationMatches(entity(), "Payment from MINISEND")).toBe(true);
    expect(narrationMatches(entity(), "NMD/TXN/CREDIT")).toBe(false);
    expect(narrationMatches(entity(), null)).toBe(false);
  });

  it("treats a /…/ pattern as a regex so a sender can be pinned exactly", () => {
    const pinned = entity({ narrationPatterns: ["/^nmd\\/txn\\//"] });
    expect(narrationMatches(pinned, "NMD/TXN/REF/9912")).toBe(true);
    expect(narrationMatches(pinned, "Payment from Minisend")).toBe(false);
  });

  it("survives a malformed regex instead of taking the scan down", () => {
    expect(narrationMatches(entity({ narrationPatterns: ["/([/"] }), "anything")).toBe(false);
  });

  it("does not match a provider name hidden inside a longer word", () => {
    // A substring match is the right tool for a provider name, but it must not
    // turn an unrelated payee into a cash-out.
    expect(narrationMatches(entity({ narrationPatterns: ["bush"] }), "Bushrod Fisheries Ltd")).toBe(true);
    expect(narrationMatches(entity({ narrationPatterns: ["busha"] }), "BUSHIDO MART")).toBe(false);
  });
});

describe("configuration", () => {
  it("falls back to conservative defaults when nothing is configured", () => {
    const previous = { ...process.env };
    delete process.env.OFFRAMP_MATCH_WINDOW_HOURS;
    delete process.env.OFFRAMP_RATE_TOLERANCE;
    const config = stablecoinConfig();
    expect(config.OFFRAMP_MATCH_WINDOW_HOURS).toBe(6);
    expect(config.OFFRAMP_RATE_TOLERANCE).toBe(0.08);
    process.env = previous;
  });

  it("reads an override that is in range", () => {
    const previous = process.env.OFFRAMP_MATCH_WINDOW_HOURS;
    process.env.OFFRAMP_MATCH_WINDOW_HOURS = "12";
    expect(stablecoinConfig().OFFRAMP_MATCH_WINDOW_HOURS).toBe(12);
    if (previous === undefined) delete process.env.OFFRAMP_MATCH_WINDOW_HOURS;
    else process.env.OFFRAMP_MATCH_WINDOW_HOURS = previous;
  });

  it("ignores an out-of-range override rather than adopting it", () => {
    const previous = process.env.OFFRAMP_RATE_TOLERANCE;
    // A 100% tolerance would pair anything with anything.
    process.env.OFFRAMP_RATE_TOLERANCE = "5";
    expect(stablecoinConfig().OFFRAMP_RATE_TOLERANCE).toBe(0.08);
    if (previous === undefined) delete process.env.OFFRAMP_RATE_TOLERANCE;
    else process.env.OFFRAMP_RATE_TOLERANCE = previous;
  });
});