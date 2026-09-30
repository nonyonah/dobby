import { describe, expect, it } from "vitest";
import { usRules } from "./us.js";

type Input = Parameters<typeof usRules.calculate>[0];
const run = ({
  taxYear = 2026,
  deductions = {},
  inputs = {},
  now = new Date("2026-05-01"),
  transactions,
}: Partial<Input> & Pick<Input, "transactions">) => usRules.calculate({ taxYear, deductions, inputs, now, transactions });

const income = (amount: number, incomeSource: "EMPLOYMENT" | "SELF_EMPLOYMENT" | "INVESTMENT" | "OTHER") => ({
  type: "INCOME" as const,
  amount,
  isTaxable: true,
  incomeSource,
});

const component = (result: ReturnType<typeof usRules.calculate>, key: string) =>
  result.components.find((item) => item.key === key)!.amount;

describe("US tax rules", () => {
  it("taxes self-employment income as income tax plus self-employment tax", () => {
    const result = run({ transactions: [income(80_000, "SELF_EMPLOYMENT")] });
    // 12.4% of 80,000 (under the wage base) + 2.9% Medicare, less half of it, then
    // the 2026 single brackets on what is left after the standard deduction.
    expect(component(result, "selfEmploymentTax")).toBeCloseTo(12_240, 2);
    expect(result.taxableIncome).toBeCloseTo(57_780, 2);
    expect(component(result, "incomeTax")).toBeCloseTo(7_423.6, 2);
    expect(result.estimatedTaxOwed).toBeCloseTo(19_663.6, 2);
  });

  it("does not apply self-employment tax to wages", () => {
    const result = run({ transactions: [income(100_000, "EMPLOYMENT")] });
    expect(component(result, "selfEmploymentTax")).toBe(0);
    expect(component(result, "incomeTax")).toBeCloseTo(13_170, 2);
    expect(result.estimatedTaxOwed).toBeCloseTo(13_170, 2);
  });

  it("shares the Social Security wage base between wages and self-employment", () => {
    const result = run({ transactions: [income(100_000, "EMPLOYMENT"), income(100_000, "SELF_EMPLOYMENT")] });
    // Wages already used 100,000 of the 184,500 base, so only 84,500 of the
    // freelance income attracts the 12.4% Social Security portion.
    expect(component(result, "selfEmploymentTax")).toBeCloseTo(13_378, 2);
    expect(result.estimatedTaxOwed).toBeCloseTo(48_506.64, 2);
  });

  it("leaves Medicare uncapped above the wage base", () => {
    const result = run({ transactions: [income(200_000, "SELF_EMPLOYMENT")] });
    const seTax = component(result, "selfEmploymentTax");
    const ssPortion = 184_500 * 0.124;
    expect(seTax).toBeCloseTo(ssPortion + 200_000 * 0.029, 2);
  });

  it("adds the Additional Medicare Tax above the threshold", () => {
    const result = run({ transactions: [income(250_000, "EMPLOYMENT")] });
    expect(component(result, "additionalMedicareTax")).toBeCloseTo(450, 2);
    expect(result.estimatedTaxOwed).toBeCloseTo(51_754, 2);
  });

  it("does not guess a rate table for unlabelled income but says so", () => {
    const result = run({ transactions: [{ type: "INCOME", amount: 50_000, isTaxable: true, incomeSource: null }] });
    expect(component(result, "selfEmploymentTax")).toBe(0);
    expect(result.notes.some((note) => note.includes("not labelled"))).toBe(true);
  });

  it("respects the filing status standard deduction", () => {
    const single = run({ transactions: [income(120_000, "EMPLOYMENT")] });
    const joint = run({ transactions: [income(120_000, "EMPLOYMENT")], inputs: { filingStatus: "married-joint" } });
    expect(joint.estimatedTaxOwed).toBeLessThan(single.estimatedTaxOwed);
    expect(joint.deductions.standardDeduction).toBe(32_200);
  });

  it("flags an unmigrated tax year rather than silently using this year's figures", () => {
    const result = run({ taxYear: 2019, transactions: [income(80_000, "SELF_EMPLOYMENT")] });
    expect(result.notes.some((note) => note.includes("have not been updated yet"))).toBe(true);
  });

  it("schedules quarterly estimated payments", () => {
    const result = run({ transactions: [income(80_000, "SELF_EMPLOYMENT")] });
    expect(result.quarterly?.required).toBe(true);
    expect(result.quarterly?.nextDueDate).toBe("2026-06-15");
    expect(result.quarterly?.currentPayment).toBeCloseTo(result.estimatedTaxOwed / 4, 2);
  });

  it("does not require payments on a trivial liability", () => {
    const result = run({ transactions: [income(1_000, "SELF_EMPLOYMENT")] });
    expect(result.quarterly?.required).toBe(false);
    expect(result.quarterly?.nextDueDate).toBeNull();
  });
});
