import { describe, expect, it } from "vitest";
import { ukRules } from "./uk.js";

type Input = Parameters<typeof ukRules.calculate>[0];
const run = ({
  taxYear = 2026,
  deductions = {},
  inputs = {},
  now = new Date("2026-05-01"),
  transactions,
}: Partial<Input> & Pick<Input, "transactions">) => ukRules.calculate({ taxYear, deductions, inputs, now, transactions });

const income = (amount: number, incomeSource: "EMPLOYMENT" | "SELF_EMPLOYMENT" | "OTHER") => ({
  type: "INCOME" as const,
  amount,
  isTaxable: true,
  incomeSource,
});

const component = (result: ReturnType<typeof ukRules.calculate>, key: string) =>
  result.components.find((item) => item.key === key)!.amount;

describe("UK tax rules", () => {
  it("gives the full personal allowance below the taper threshold", () => {
    const result = run({ transactions: [income(30_000, "EMPLOYMENT")] });
    expect(result.deductions.personalAllowance).toBe(12_570);
    expect(result.taxableIncome).toBe(17_430);
    expect(component(result, "incomeTax")).toBeCloseTo(3_486, 2);
    expect(result.estimatedTaxOwed).toBeCloseTo(5_785.6, 2);
  });

  it("tapers the allowance to nothing at £125,140", () => {
    const result = run({ transactions: [income(150_000, "EMPLOYMENT")] });
    expect(result.deductions.personalAllowance).toBe(0);
    // 20% to 50,270, 40% to 125,140, 45% above.
    expect(component(result, "incomeTax")).toBeCloseTo(51_189, 2);
  });

  it("charges 50p more tax per extra pound inside the taper", () => {
    const before = run({ transactions: [income(110_000, "EMPLOYMENT")] });
    const after = run({ transactions: [income(110_001, "EMPLOYMENT")] });
    // The extra pound costs 40p of band rate plus 10p because the allowance
    // drops by 50p, which is itself deductible.
    expect(component(after, "incomeTax") - component(before, "incomeTax")).toBeCloseTo(0.6, 6);
  });

  it("applies Class 1 National Insurance to wages", () => {
    const result = run({ transactions: [income(30_000, "EMPLOYMENT")] });
    // 8% on earnings between the £1,255 primary threshold and the upper earnings limit.
    expect(component(result, "nationalInsurance")).toBeCloseTo(2_299.6, 2);
  });

  it("applies Class 4 to self-employment income and Class 1 to neither", () => {
    const result = run({ transactions: [income(60_000, "SELF_EMPLOYMENT")] });
    expect(component(result, "nationalInsurance")).toBeCloseTo(4_116.64, 2);
  });

  it("reports employer National Insurance separately from the user's own liability", () => {
    const result = run({ transactions: [income(30_000, "EMPLOYMENT")] });
    expect(component(result, "employerNi")).toBeCloseTo(431.175, 3);
    expect(result.estimatedTaxOwed).toBe(component(result, "incomeTax") + component(result, "nationalInsurance"));
  });

  it("drops the employee rate to 2% above the upper earnings limit", () => {
    const result = run({ transactions: [income(60_000, "SELF_EMPLOYMENT")] });
    const limit = 967 * 52;
    const expected = (limit - 1_255) * 0.08 + (60_000 - limit) * 0.02;
    expect(component(result, "nationalInsurance")).toBeCloseTo(expected, 6);
  });

  it("caps Rent-a-room relief at £7,500", () => {
    const result = run({ transactions: [income(30_000, "EMPLOYMENT")], deductions: { rentARoom: 20_000 } });
    expect(result.deductions.rentARoom).toBe(7_500);
  });

  it("uses separate bands and no allowance for Scotland", () => {
    const result = run({ transactions: [income(30_000, "EMPLOYMENT")], inputs: { region: "scotland" } });
    expect(result.deductions.personalAllowance).toBe(0);
    expect(component(result, "incomeTax")).toBeCloseTo(5_425.78, 2);
    expect(result.notes.some((note) => note.includes("Scotland"))).toBe(true);
  });

  it("estimates in pounds and labels the April-to-April tax year", () => {
    expect(ukRules.currency).toBe("GBP");
    const result = run({ taxYear: 2026, transactions: [income(30_000, "EMPLOYMENT")] });
    expect(result.taxYearLabel).toBe("6 April 2026 – 5 April 2027");
  });
});
