import { describe, expect, it } from "vitest";
import { southAfricaRules } from "./south-africa.js";

type Input = Parameters<typeof southAfricaRules.calculate>[0];
const run = ({
  taxYear = 2027,
  deductions = {},
  inputs = {},
  now = new Date("2026-05-01"),
  transactions,
}: Partial<Input> & Pick<Input, "transactions">) => southAfricaRules.calculate({ taxYear, deductions, inputs, now, transactions });

const income = (amount: number) => ({ type: "INCOME" as const, amount, isTaxable: true });

describe("South Africa tax rules", () => {
  it("runs 1 March to the end of February, not the calendar year", () => {
    const period = southAfricaRules.periodFor(2027);
    expect(period.start.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(period.end.toISOString()).toBe("2027-03-01T00:00:00.000Z");
    expect(period.label).toBe("1 March 2026 – 28 February 2027");
  });

  it("applies the year of assessment brackets then subtracts credits", () => {
    const result = run({ transactions: [income(500_000)] });
    // 18% of 245,100 + 26% of 138,000 + 31% of 116,900 = 116,237.
    const grossTax = 245_100 * 0.18 + 138_000 * 0.26 + 116_900 * 0.31;
    expect(grossTax).toBeCloseTo(116_237, 2);
    expect(result.estimatedTaxOwed).toBeCloseTo(grossTax - 26_844, 2);
    expect(result.estimatedTaxOwed).toBeCloseTo(89_393, 2);
  });

  it("pays no tax below the under-65 threshold", () => {
    expect(run({ transactions: [income(98_000)] }).estimatedTaxOwed).toBe(0);
  });

  it("adds the secondary and tertiary rebates by age band", () => {
    const under65 = run({ transactions: [income(500_000)] });
    const over75 = run({ transactions: [income(500_000)], inputs: { ageBand: "75plus" } });
    expect(under65.credits.secondaryRebate).toBe(0);
    expect(over75.credits.secondaryRebate).toBe(9_765);
    expect(over75.credits.tertiaryRebate).toBe(3_249);
    expect(under65.estimatedTaxOwed - over75.estimatedTaxOwed).toBeCloseTo(13_014, 2);
  });

  it("credits medical scheme fees per month for each additional dependant", () => {
    const result = run({ transactions: [income(500_000)], inputs: { additionalDependants: "2" } });
    expect(result.credits.medicalSchemeCredit).toBe(12 * (2 * 376 + 2 * 254));
    expect(result.credits.medicalSchemeCredit).toBe(15_120);
  });

  it("caps retirement contributions at the lower of R430,000 and 27.5%", () => {
    const result = run({ transactions: [income(2_000_000)], deductions: { retirementContributions: 1_000_000 } });
    expect(result.deductions.retirementCap).toBe(430_000);
    expect(result.deductions.retirement).toBe(430_000);
  });

  it("applies the 27.5% limit when it bites first", () => {
    const result = run({ transactions: [income(500_000)], deductions: { retirementContributions: 500_000 } });
    expect(result.deductions.retirementCap).toBeCloseTo(137_500, 2);
    expect(result.deductions.retirement).toBeCloseTo(137_500, 2);
  });

  it("caps section 18A donations at 10% of taxable income and carries the rest forward", () => {
    const result = run({ transactions: [income(1_000_000)], deductions: { donationsPbo: 500_000 } });
    expect(result.deductions.donations).toBeCloseTo(100_000, 2);
    expect(result.deductions.donationsCarriedForward).toBeCloseTo(400_000, 2);
  });

  it("reports credits separately from deductions", () => {
    const result = run({ transactions: [income(500_000)] });
    expect(result.credits.total).toBeCloseTo(26_844, 2);
    expect(result.deductions.total).toBe(0);
    expect(result.notes.some((note) => note.includes("credits"))).toBe(true);
  });

  it("estimates in rand", () => {
    expect(southAfricaRules.currency).toBe("ZAR");
  });
});
