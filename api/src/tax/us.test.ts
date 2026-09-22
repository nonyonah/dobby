import { describe, expect, it } from "vitest";
import { usRules } from "./us.js";

describe("US tax rules", () => {
  it("calculates self-employment tax and quarterly payment", () => {
    const result = usRules.calculate({ taxYear: 2026, transactions: [{ type: "INCOME", amount: 10000, isTaxable: true }], deductions: {}, now: new Date("2026-05-01") });
    expect(result.estimatedTaxOwed).toBeCloseTo(1412.955, 2);
    expect(result.quarterly?.required).toBe(true);
    expect(result.quarterly?.nextDueDate).toBe("2026-06-15");
  });
});
