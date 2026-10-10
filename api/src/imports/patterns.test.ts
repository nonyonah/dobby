import { describe, expect, it } from "vitest";
import { matchDeterministic, suggestLoan } from "./patterns.js";

describe("deterministic narration patterns", () => {
  it("routes airtime and data to Phone & Data without the model", () => {
    expect(matchDeterministic("Mobile Data | 8153324197 | Glo | 3GB 3 Days Plan", "EXPENSE")?.category).toBe("Phone & Data");
    expect(matchDeterministic("Airtime | 0703...", "EXPENSE")?.category).toBe("Phone & Data");
  });

  it("routes bank and withdrawal wording", () => {
    expect(matchDeterministic("USSD Charge", "EXPENSE")?.category).toBe("Bank charges");
    expect(matchDeterministic("Transfer to POS Transfer - ANN EGBO | MONIE POINT | 5543470812", "EXPENSE")?.category)
      .toBe("Cash withdrawal");
  });

  it("routes interest to income", () => {
    expect(matchDeterministic("OWealth Interest Earned", "INCOME")?.category).toBe("Interest income");
  });

  it("does not apply an expense pattern to an inflow", () => {
    // "Interest earned" arriving on an outflow would otherwise be relabelled as
    // spending, which is how money disappears from the totals.
    expect(matchDeterministic("Interest Earned", "EXPENSE")).toBeNull();
    expect(matchDeterministic("Mobile Data refund", "INCOME")).toBeNull();
  });

  it("matches regardless of spacing and case", () => {
    expect(matchDeterministic("mobile   data  | 0803", "EXPENSE")?.category).toBe("Phone & Data");
    expect(matchDeterministic("MOBILE DATA", "EXPENSE")?.category).toBe("Phone & Data");
  });

  it("returns null when nothing matches", () => {
    expect(matchDeterministic("Transfer from NGOZI PATIENCE CHUKWUBIKEM | OPay | 7038858821", "EXPENSE")).toBeNull();
  });
});

describe("loan suggestion", () => {
  it("fires on the OPay borrow wording", () => {
    expect(suggestLoan("Transfer from ABUMISI ADAEZE BARBARA | Guaranty Trust Bank | 031****357 | Borrow/loan to CHINONSO EMMANUEL Onah.")).toBe(true);
  });

  it("does not fire on ordinary wording", () => {
    expect(suggestLoan("Transfer from NOMBA FINANCIAL SERVICES LIMITED | OPay | 559****478 | Payment")).toBe(false);
  });
});