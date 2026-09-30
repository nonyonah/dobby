import { describe, expect, it } from "vitest";
import { kenyaRules } from "./kenya.js";

type Input = Parameters<typeof kenyaRules.calculate>[0];
const run = ({
  taxYear = 2026,
  deductions = {},
  inputs = {},
  now = new Date("2026-05-01"),
  transactions,
}: Partial<Input> & Pick<Input, "transactions">) => kenyaRules.calculate({ taxYear, deductions, inputs, now, transactions });

const income = (amount: number, incomeSource: "EMPLOYMENT" | "SELF_EMPLOYMENT" | "OTHER" = "OTHER") => ({
  type: "INCOME" as const,
  amount,
  isTaxable: true,
  incomeSource,
});

const component = (result: ReturnType<typeof kenyaRules.calculate>, key: string) =>
  result.components.find((item) => item.key === key)!.amount;

describe("Kenya tax rules", () => {
  it("charges nothing on income below the personal relief", () => {
    expect(run({ transactions: [income(100_000)] }).estimatedTaxOwed).toBe(0);
  });

  it("accumulates the PAYE bands then removes personal relief", () => {
    const result = run({ transactions: [income(1_000_000)] });
    // 10% of 288,000 + 25% of 100,000 + 30% of 583,200 = 228,760, less relief.
    expect(result.taxableIncome).toBeCloseTo(971_200, 2);
    expect(component(result, "paye")).toBeCloseTo(199_960, 2);
  });

  it("caps insurance relief at KSh 60,000", () => {
    const result = run({ transactions: [income(5_000_000)], deductions: { insurancePremiums: 1_000_000 } });
    expect(result.deductions.insuranceRelief).toBe(60_000);
  });

  it("applies 15% insurance relief below the cap", () => {
    const result = run({ transactions: [income(5_000_000)], deductions: { insurancePremiums: 200_000 } });
    expect(result.deductions.insuranceRelief).toBeCloseTo(30_000, 2);
  });

  it("taxes non-residents on a flat schedule with no personal relief", () => {
    const result = run({ transactions: [income(1_000_000, "EMPLOYMENT")], inputs: { residencyStatus: "non-resident" } });
    expect(component(result, "employmentTax")).toBeCloseTo(150_000, 2);
    expect(result.deductions.total).toBe(0);
  });

  it("charges non-resident business income at 30% above the monthly threshold", () => {
    const result = run({
      transactions: [income(2_400_000, "SELF_EMPLOYMENT")],
      inputs: { residencyStatus: "non-resident" },
    });
    expect(component(result, "businessTax")).toBeCloseTo(720_000, 2);
  });

  it("applies instalment tax above KSh 100,000 a month of employment income", () => {
    const employed = run({ transactions: [income(2_400_000, "EMPLOYMENT")] });
    expect(component(employed, "instalmentTax")).toBeCloseTo(240_000, 2);
    const selfEmployed = run({ transactions: [income(2_400_000, "SELF_EMPLOYMENT")] });
    expect(component(selfEmployed, "instalmentTax")).toBe(0);
  });

  it("warns that instalment tax is already taken from pay", () => {
    const result = run({ transactions: [income(2_400_000, "EMPLOYMENT")] });
    expect(result.notes.some((note) => note.includes("double-counts"))).toBe(true);
  });

  it("estimates in shillings", () => {
    expect(kenyaRules.currency).toBe("KES");
  });
});
