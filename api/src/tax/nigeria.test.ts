import { describe, expect, it } from "vitest";
import { nigeriaRules } from "./nigeria.js";

describe("Nigeria tax rules", () => {
  it("applies the tax-free threshold", () => {
    const result = nigeriaRules.calculate({ taxYear: 2026, transactions: [{ type: "INCOME", amount: 800000, isTaxable: true }], deductions: {}, now: new Date("2026-09-01") });
    expect(result.estimatedTaxOwed).toBe(0);
  });
  it("caps rent relief at 500000", () => {
    const result = nigeriaRules.calculate({ taxYear: 2026, transactions: [{ type: "INCOME", amount: 5000000, isTaxable: true }], deductions: { rentPaid: 5000000 }, now: new Date("2026-09-01") });
    expect(result.deductions.rentRelief).toBe(500000);
  });
});
