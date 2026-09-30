import { describe, expect, it } from "vitest";
import { nigeriaRules } from "./nigeria.js";

type Input = Parameters<typeof nigeriaRules.calculate>[0];
const run = ({
  taxYear = 2026,
  deductions = {},
  inputs = {},
  now = new Date("2026-05-01"),
  transactions,
}: Partial<Input> & Pick<Input, "transactions">) => nigeriaRules.calculate({ taxYear, deductions, inputs, now, transactions });

describe("Nigeria tax rules", () => {
  it("exempts the first ₦800,000 band entirely", () => {
    expect(run({ transactions: [{ type: "INCOME", amount: 800_000, isTaxable: true }] }).estimatedTaxOwed).toBe(0);
  });

  it("charges 15% only on the second band", () => {
    // ₦1,200,000 total: ₦400,000 above the nil band at 15% = ₦60,000.
    expect(run({ transactions: [{ type: "INCOME", amount: 1_200_000, isTaxable: true }] }).estimatedTaxOwed).toBeCloseTo(60_000, 2);
  });

  it("accumulates bands progressively", () => {
    // ₦6,000,000 = 0 + ₦2.2m@15% + ₦3m@18% = ₦330,000 + ₦540,000.
    expect(run({ transactions: [{ type: "INCOME", amount: 6_000_000, isTaxable: true }] }).estimatedTaxOwed).toBeCloseTo(870_000, 2);
  });

  it("caps rent relief at ₦500,000 even when rent is large", () => {
    const result = run({
      transactions: [{ type: "INCOME", amount: 10_000_000, isTaxable: true }],
      deductions: { rentPaid: 5_000_000 },
    });
    expect(result.deductions.rentRelief).toBe(500_000);
  });

  it("applies 20% rent relief below the cap", () => {
    const result = run({
      transactions: [{ type: "INCOME", amount: 10_000, isTaxable: true }],
      deductions: { rentPaid: 1_000_000 },
    });
    expect(result.deductions.rentRelief).toBe(200_000);
  });

  it("includes every s.30(2) eligible deduction in the total", () => {
    const result = run({
      transactions: [{ type: "INCOME", amount: 50_000_000, isTaxable: true }],
      deductions: {
        rentPaid: 1_000_000,
        pensionContributions: 1_000_000,
        nhfContributions: 100_000,
        nhisContributions: 50_000,
        housingLoanInterest: 200_000,
        lifeAssurance: 300_000,
      },
    });
    expect(result.deductions.total).toBeCloseTo(200_000 + 1_000_000 + 100_000 + 50_000 + 200_000 + 300_000, 2);
  });

  it("requires evidence on every deduction because of s.31", () => {
    expect(nigeriaRules.deductions).toHaveLength(6);
    expect(nigeriaRules.deductions?.every((deduction) => deduction.requiresEvidence)).toBe(true);
  });

  it("estimates in naira over the calendar year", () => {
    expect(nigeriaRules.currency).toBe("NGN");
    expect(nigeriaRules.periodFor(2026).label).toContain("1 January 2026");
  });
});
