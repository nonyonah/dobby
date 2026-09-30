import { describe, expect, it } from "vitest";
import { canadaRules } from "./canada.js";

type Input = Parameters<typeof canadaRules.calculate>[0];
const run = ({
  taxYear = 2026,
  deductions = {},
  inputs = {},
  now = new Date("2026-05-01"),
  transactions,
}: Partial<Input> & Pick<Input, "transactions">) => canadaRules.calculate({ taxYear, deductions, inputs, now, transactions });

const income = (amount: number) => ({ type: "INCOME" as const, amount, isTaxable: true });

const component = (result: ReturnType<typeof canadaRules.calculate>, key: string) =>
  result.components.find((item) => item.key === key)!.amount;

describe("Canada tax rules (federal only)", () => {
  it("credits the basic personal amount against low incomes", () => {
    const result = run({ transactions: [income(100_000)] });
    expect(result.taxableIncome).toBeCloseTo(100_000, 2);
    expect(result.credits.basicPersonalAmount).toBeCloseTo(17_373, 2);
    expect(component(result, "federalIncomeTax")).toBe(0);
  });

  it("phases the basic personal amount out to zero at the top of the rates", () => {
    const result = run({ transactions: [income(250_000)] });
    expect(result.credits.basicPersonalAmount).toBe(0);
    // 14% of 58,523 + 20.5% of 58,522 + 26% of 64,395 + 29% of 68,560.
    expect(component(result, "federalIncomeTax")).toBeCloseTo(56_815.33, 2);
  });

  it("collects both CPP shares from self-employment income", () => {
    const result = run({ transactions: [income(100_000)] });
    expect(component(result, "cpp")).toBeCloseTo(71_300 * 0.118, 2);
    expect(result.estimatedTaxOwed).toBeCloseTo(8_413.4, 2);
  });

  it("adds the enhanced CPP share at 65 and over", () => {
    const standard = run({ transactions: [income(100_000)] });
    const senior = run({ transactions: [income(100_000)], inputs: { age65: "yes" } });
    expect(senior.credits.basicPersonalAmount ?? 0).toBeCloseTo(standard.credits.basicPersonalAmount ?? 0, 2);
    expect(component(senior, "cpp") - component(standard, "cpp")).toBeCloseTo(71_300 * 0.004, 2);
  });

  it("caps CPP at the year's maximum pensionable earnings", () => {
    const result = run({ transactions: [income(500_000)] });
    expect(component(result, "cpp")).toBeCloseTo(71_300 * 0.118, 2);
  });

  it("deducts RRSP contributions before the brackets", () => {
    const result = run({ transactions: [income(150_000)], deductions: { rrspContributions: 20_000 } });
    expect(result.taxableIncome).toBeCloseTo(130_000, 2);
  });

  it("schedules federal instalments on the 15th of Apr, Jun, Sep and Dec", () => {
    const result = run({ transactions: [income(250_000)] });
    expect(result.quarterly?.required).toBe(true);
    expect(result.quarterly?.nextDueDate).toBe("2026-06-15");
  });

  it("labels the result as federal only everywhere it surfaces", () => {
    const result = run({ transactions: [income(250_000)] });
    expect(result.notes.some((note) => note.includes("FEDERAL tax only"))).toBe(true);
    expect(result.notes.some((note) => note.includes("additional and is not included"))).toBe(true);
  });

  it("estimates in Canadian dollars", () => {
    expect(canadaRules.currency).toBe("CAD");
  });
});
