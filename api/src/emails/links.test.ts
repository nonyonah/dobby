import { describe, expect, it } from "vitest";
import { formatMoney } from "./links.js";

/**
 * Every amount in an email is rendered through here, so the symbol a customer
 * sees is decided in one place. The list is every currency the app offers in
 * Settings, because a currency that falls through to a bare code is a bug the
 * customer sees before we do.
 */
describe("formatMoney", () => {
  it("uses the symbol for every currency Settings offers", () => {
    expect(formatMoney(1240, "USD")).toBe("$1,240.00");
    expect(formatMoney(985000, "NGN")).toBe("₦985,000.00");
    expect(formatMoney(1699.99, "CAD")).toBe("CA$1,699.99");
    expect(formatMoney(24.5, "GBP")).toBe("£24.50");
    expect(formatMoney(52300, "KES")).toBe("KSh 52,300.00");
    expect(formatMoney(18300.5, "ZAR")).toBe("R18,300.50");
  });

  it("is case-insensitive, because the setting is stored lowercase", () => {
    // Settings writes `ngn`; a lookup keyed on the raw value would silently
    // produce a bare number for half the accounts.
    expect(formatMoney(10, "ngn")).toBe(formatMoney(10, "NGN"));
    expect(formatMoney(10, "usd")).toBe(formatMoney(10, "USD"));
  });

  it("drops the decimals where the currency has none", () => {
    expect(formatMoney(98000, "JPY")).toBe("¥98,000");
    expect(formatMoney(98000, "KRW")).toBe("₩98,000");
  });

  it("falls back to the code when there is no symbol to show", () => {
    expect(formatMoney(10, "XAF")).toBe("XAF 10.00");
  });

  it("keeps the minus outside the symbol", () => {
    expect(formatMoney(-1240, "USD")).toBe("-$1,240.00");
    expect(formatMoney(-985000, "NGN")).toBe("-₦985,000.00");
  });

  it("treats a non-finite amount as zero rather than printing NaN", () => {
    // A summary with no rows divides to NaN, and "₦NaN" in an email is worse
    // than a zero the reader can reconcile.
    expect(formatMoney(Number.NaN, "USD")).toBe("$0.00");
    expect(formatMoney(Number.POSITIVE_INFINITY, "USD")).toBe("$0.00");
  });

  it("groups thousands", () => {
    expect(formatMoney(1234567.89, "USD")).toBe("$1,234,567.89");
  });
});
